import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { compileBrands } from "../src/brands.js";
import { loadConfig } from "../src/config.js";
import { UpstreamError, type ShopbyClient } from "../src/shopby.js";
import {
  COMMON_SORTS,
  SourceError,
  type Item,
  type Source,
  type SourceId,
  type SourceResult,
  type SourceSearchParams,
} from "../src/sources/types.js";
import example from "../brands.example.json" with { type: "json" };

const config = { ...loadConfig({}), rateLimitPerMinute: 1000 };
const brands = compileBrands(example);

const item = (source: SourceId, id: string, name: string, brand: string | null = null): Item => ({
  source,
  id,
  name,
  brand,
  price: 1000,
  discountedPrice: 900,
  discountRate: 10,
  soldOut: false,
  imageUrl: null,
  url: `https://example.test/${id}`,
});

function fakeSource(id: SourceId, label: string, impl?: (p: SourceSearchParams) => Promise<SourceResult>) {
  const search = vi.fn(impl ?? (async () => ({ totalCount: 1, items: [item(id, "1", `${label} 상품`)] })));
  const source: Source = { id, label, sorts: COMMON_SORTS, maxPage: null, maxSize: 100, search };
  return { source, search };
}

describe("GET /search?sources=", () => {
  let thirtymall: ReturnType<typeof fakeSource>;
  let musinsa: ReturnType<typeof fakeSource>;
  let twentynine: ReturnType<typeof fakeSource>;
  let app: ReturnType<typeof buildApp>;

  const build = () =>
    buildApp(config, {} as ShopbyClient, brands, {
      thirtymall: thirtymall.source,
      musinsa: musinsa.source,
      "29cm": twentynine.source,
    });

  beforeEach(() => {
    thirtymall = fakeSource("thirtymall", "떠리몰");
    musinsa = fakeSource("musinsa", "무신사");
    twentynine = fakeSource("29cm", "29CM");
    app = build();
  });

  it("고른 소스를 순서대로 검색하고 기본값을 채운다", async () => {
    const res = await app.inject({ url: "/search?q=%ED%8F%B4%EB%A1%9C&sources=musinsa,29cm" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ query: "폴로", sort: "relevance", page: 1, size: 20 });
    expect(body.results.map((r: { source: string }) => r.source)).toEqual(["musinsa", "29cm"]);
    expect(body.results[0]).toMatchObject({ ok: true, totalCount: 1 });
    expect(musinsa.search).toHaveBeenCalledWith({ q: "폴로", sort: "relevance", page: 1, size: 20 });
    expect(thirtymall.search).not.toHaveBeenCalled();
  });

  it("한 소스가 실패해도 나머지는 돌려준다", async () => {
    musinsa.search.mockRejectedValueOnce(new UpstreamError(502, "boom"));
    const body = (await app.inject({ url: "/search?q=a&sources=musinsa,29cm" })).json();
    expect(body.results[0]).toEqual({ source: "musinsa", ok: false, error: "upstream_error", message: "boom" });
    expect(body.results[1]).toMatchObject({ source: "29cm", ok: true });
  });

  it("소스가 지원하지 않는 페이지면 그 소스만 unsupported_page", async () => {
    musinsa.search.mockRejectedValueOnce(new SourceError("unsupported_page", "page 1 only"));
    const body = (await app.inject({ url: "/search?q=a&sources=musinsa,29cm&page=2" })).json();
    expect(body.results[0]).toMatchObject({ source: "musinsa", ok: false, error: "unsupported_page" });
    expect(body.results[1]).toMatchObject({ source: "29cm", ok: true });
  });

  it("sources 의 공백·빈 칸·중복을 정리한다", async () => {
    const body = (await app.inject({ url: "/search?q=a&sources=%20musinsa,,29cm,musinsa" })).json();
    expect(body.results.map((r: { source: string }) => r.source)).toEqual(["musinsa", "29cm"]);
  });

  it.each(["", "nope", ",", "musinsa,nope"])("sources=%s 는 400", async (s) => {
    const res = await app.inject({ url: `/search?q=a&sources=${s}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });

  it("sources 와 함께 기존 정렬값을 주면 400", async () => {
    const res = await app.inject({ url: "/search?q=a&sources=musinsa&sort=popular" });
    expect(res.statusCode).toBe(400);
  });

  it("size 가 100 을 넘으면 400", async () => {
    const res = await app.inject({ url: "/search?q=a&sources=musinsa&size=101" });
    expect(res.statusCode).toBe(400);
  });

  it("brand 를 주면 [브랜드] 상품명 으로 판정해 거른다", async () => {
    musinsa.search.mockResolvedValueOnce({
      totalCount: 2,
      items: [item("musinsa", "1", "맨투맨", "에이크미"), item("musinsa", "2", "[다른브랜드] 셔츠")],
    });
    const body = (await app.inject({ url: "/search?q=a&sources=musinsa&brand=acme" })).json();
    expect(body.brand).toBe("acme");
    expect(body.results[0].items.map((i: Item) => i.id)).toEqual(["1"]);
    expect(body.results[0].excludedCount).toBe(1);
  });

  it("모르는 brand 면 400", async () => {
    const res = await app.inject({ url: "/search?q=a&sources=musinsa&brand=nope" });
    expect(res.statusCode).toBe(400);
  });

  it("같은 요청은 캐시하고 실패한 결과는 캐시하지 않는다", async () => {
    musinsa.search.mockRejectedValueOnce(new UpstreamError(502, "boom"));
    await app.inject({ url: "/search?q=a&sources=musinsa" });
    await app.inject({ url: "/search?q=a&sources=musinsa" });
    await app.inject({ url: "/search?q=a&sources=musinsa" });
    expect(musinsa.search).toHaveBeenCalledTimes(2);
  });
});

describe("GET /sources", () => {
  it("소스 목록과 지원 정렬을 돌려준다", async () => {
    const app = buildApp(config, { search: vi.fn() } as unknown as ShopbyClient, brands);
    const res = await app.inject({ url: "/sources" });
    expect(res.json()).toEqual({
      sources: [
        { id: "thirtymall", label: "떠리몰", sorts: ["relevance", "price_asc", "price_desc", "newest"], maxPage: 500 },
        { id: "musinsa", label: "무신사", sorts: ["relevance", "price_asc", "price_desc", "newest"], maxPage: 1 },
        { id: "29cm", label: "29CM", sorts: ["relevance"], maxPage: null },
      ],
    });
  });
});

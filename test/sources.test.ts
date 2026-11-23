import { describe, expect, it, vi } from "vitest";
import { fetchJson } from "../src/sources/http.js";
import { productToItem, thirtymallSource } from "../src/sources/thirtymall.js";
import { toProduct, UpstreamError, type SearchParams } from "../src/shopby.js";
import { shopbyProduct } from "./fixtures.js";
import { musinsaSource } from "../src/sources/musinsa.js";
import { SourceError } from "../src/sources/types.js";
import musinsaFixture from "./fixtures/musinsa.json" with { type: "json" };

const emptyResult = (p: SearchParams) => ({
  query: p.q,
  correctedQuery: null,
  page: p.page,
  size: p.size,
  totalCount: 0,
  pageCount: 0,
  items: [],
});

describe("thirtymallSource", () => {
  it.each([
    ["relevance", "popular"],
    ["price_asc", "price_asc"],
    ["price_desc", "price_desc"],
    ["newest", "newest"],
  ] as const)("정렬 %s 를 떠리몰 %s 로 넘긴다", async (sort, upstream) => {
    const search = vi.fn(async (p: SearchParams) => emptyResult(p));
    await thirtymallSource({ search }).search({ q: "폴로", sort, page: 2, size: 30 });
    expect(search).toHaveBeenCalledWith({ q: "폴로", sort: upstream, page: 2, size: 30 });
  });

  it("상품을 공통 형식으로 옮긴다", () => {
    expect(productToItem(toProduct(shopbyProduct()))).toMatchObject({
      source: "thirtymall",
      id: "138032171",
      name: "누들컬 단백질 컵라면 99g*16개입",
      brand: "#2.MD추천",
      price: 50400,
      discountedPrice: 7990,
      discountRate: 84,
      soldOut: false,
      url: "https://thirtymall.com/detail?id=138032171",
    });
  });
});

describe("fetchJson", () => {
  it("비정상 상태면 502", async () => {
    const f = vi.fn(async () => new Response("bad", { status: 500 }));
    await expect(fetchJson(new URL("https://x.test/"), {}, f as unknown as typeof fetch)).rejects.toMatchObject({
      status: 502,
    });
  });

  it("네트워크 실패면 504", async () => {
    const f = vi.fn(async () => Promise.reject(new Error("ECONNRESET")));
    const err = await fetchJson(new URL("https://x.test/"), {}, f as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.status).toBe(504);
  });
});

describe("musinsaSource", () => {
  const ok = () => vi.fn(async () => Response.json(musinsaFixture));

  it("검색 요청을 무신사 파라미터로 만든다", async () => {
    const f = ok();
    await musinsaSource(f as unknown as typeof fetch).search({ q: "폴로 셔츠", sort: "price_asc", page: 1, size: 30 });
    const url = new URL(String((f.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe("https://api.musinsa.com/api2/dp/v2/plp/goods");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      gf: "A",
      keyword: "폴로 셔츠",
      sortCode: "LOW_PRICE",
      page: "1",
      size: "30",
      caller: "SEARCH",
    });
  });

  it.each([
    ["relevance", "POPULAR"],
    ["newest", "NEW"],
    ["price_desc", "HIGH_PRICE"],
  ] as const)("정렬 %s → %s", async (sort, code) => {
    const f = ok();
    await musinsaSource(f as unknown as typeof fetch).search({ q: "a", sort, page: 1, size: 1 });
    expect(new URL(String((f.mock.calls[0] as unknown[])[0])).searchParams.get("sortCode")).toBe(code);
  });

  it("상품을 공통 형식으로 옮긴다", async () => {
    const res = await musinsaSource(ok() as unknown as typeof fetch).search({ q: "a", sort: "relevance", page: 1, size: 2 });
    const g = musinsaFixture.data.list[1];
    expect(res.totalCount).toBe(musinsaFixture.data.pagination.totalCount);
    expect(res.items[1]).toEqual({
      source: "musinsa",
      id: String(g.goodsNo),
      name: g.goodsName,
      brand: g.brandName,
      price: 100000,
      discountedPrice: 70000,
      discountRate: 30,
      soldOut: g.isSoldOut,
      imageUrl: g.thumbnail,
      url: g.goodsLinkUrl,
    });
  });

  it("2페이지부터는 지원하지 않는다(서명 토큰 필요)", async () => {
    const f = ok();
    const err = await musinsaSource(f as unknown as typeof fetch)
      .search({ q: "a", sort: "relevance", page: 2, size: 20 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.code).toBe("unsupported_page");
    expect(f).not.toHaveBeenCalled();
  });

  it("HTTP 200 이어도 실패 본문이면 upstream 오류", async () => {
    const f = vi.fn(async () =>
      Response.json({ data: null, meta: { result: "FAIL", errorCode: "DISPLAY_000_0004", message: "잘못된 접근입니다." } }),
    );
    const err = await musinsaSource(f as unknown as typeof fetch)
      .search({ q: "a", sort: "relevance", page: 1, size: 20 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.status).toBe(502);
    expect(err.message).toContain("잘못된 접근입니다.");
  });
});

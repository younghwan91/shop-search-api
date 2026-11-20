import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { compileBrands } from "../src/brands.js";
import { UpstreamError, type ShopbyClient } from "../src/shopby.js";
import example from "../brands.example.json" with { type: "json" };

const config = { ...loadConfig({}), rateLimitPerMinute: 1000 };
const brands = compileBrands(example);

function fakeClient() {
  return {
    search: vi.fn(async (p: { q: string; page: number; size: number }) => ({
      query: p.q,
      correctedQuery: null,
      page: p.page,
      size: p.size,
      totalCount: 0,
      pageCount: 0,
      items: [],
    })),
    popularKeywords: vi.fn(async () => ["치즈", "라면"]),
  };
}

describe("app", () => {
  let client: ReturnType<typeof fakeClient>;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    client = fakeClient();
    app = buildApp(config, client as unknown as ShopbyClient, brands);
  });

  it("GET /search 기본값으로 검색한다", async () => {
    const res = await app.inject({ url: "/search?q=%EB%9D%BC%EB%A9%B4" });
    expect(res.statusCode).toBe(200);
    expect(client.search).toHaveBeenCalledWith({ q: "라면", sort: "popular", page: 1, size: 20 });
  });

  it("q가 없으면 400", async () => {
    const res = await app.inject({ url: "/search" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });

  it("지원하지 않는 sort면 400", async () => {
    const res = await app.inject({ url: "/search?q=a&sort=bogus" });
    expect(res.statusCode).toBe(400);
  });

  it("같은 요청은 캐시에서 돌려준다", async () => {
    await app.inject({ url: "/search?q=a" });
    await app.inject({ url: "/search?q=a" });
    expect(client.search).toHaveBeenCalledTimes(1);
  });

  it("업스트림 오류는 그 상태 코드로 응답한다", async () => {
    client.search.mockRejectedValueOnce(new UpstreamError(502, "boom"));
    const res = await app.inject({ url: "/search?q=err" });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("upstream_error");
  });

  it("brand를 주면 전체를 받아 걸러서 페이지를 나눈다", async () => {
    const product = (id: number, name: string) => ({ id, name, brand: null }) as never;
    const searchAll = vi.fn(async () => [
      product(1, "[ACME] 에이크미 맨투맨"),
      product(2, "[에이크미클럽] 부츠"),
      product(3, "[에이크미] 볼캡"),
      product(4, "[다른브랜드] 에이크미 스타일 셔츠"),
    ]);
    app = buildApp(config, { ...client, searchAll } as unknown as ShopbyClient, brands);

    const res = await app.inject({ url: "/search?q=a&brand=acme&sort=newest&size=1&page=2" });
    const body = res.json();
    expect(searchAll).toHaveBeenCalledWith("a", "newest");
    expect(body).toMatchObject({ totalCount: 2, pageCount: 2, excludedCount: 2, brand: "acme" });
    expect(body.items.map((p: { id: number }) => p.id)).toEqual([3]);
  });

  it("모르는 brand면 400", async () => {
    const res = await app.inject({ url: "/search?q=a&brand=nope" });
    expect(res.statusCode).toBe(400);
  });

  it("GET /keywords/popular", async () => {
    const res = await app.inject({ url: "/keywords/popular" });
    expect(res.json()).toEqual({ keywords: ["치즈", "라면"] });
  });
});

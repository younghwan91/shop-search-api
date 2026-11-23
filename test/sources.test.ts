import { describe, expect, it, vi } from "vitest";
import { fetchJson } from "../src/sources/http.js";
import { productToItem, thirtymallSource } from "../src/sources/thirtymall.js";
import { toProduct, UpstreamError, type SearchParams } from "../src/shopby.js";
import { shopbyProduct } from "./fixtures.js";

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

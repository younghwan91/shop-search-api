import { describe, expect, it, vi } from "vitest";
import { ShopbyClient, UpstreamError, toProduct } from "../src/shopby.js";
import { shopbyProduct } from "./fixtures.js";

const config = {
  shopbyBaseUrl: "https://shop-api.example",
  shopbyClientId: "test-client",
  thirtymallApiUrl: "https://api.example",
};

describe("toProduct", () => {
  it("계산된 할인가와 정규화된 필드를 돌려준다", () => {
    const p = toProduct(shopbyProduct());
    expect(p).toMatchObject({
      id: 138032171,
      price: 50400,
      discountedPrice: 7990,
      discountRate: 84,
      soldOut: false,
      registeredAt: "2026-11-16 09:57:05",
      imageUrl: "https://thirtymall.cdn-nhncommerce.com/a.webp",
      url: "https://thirtymall.com/detail?id=138032171",
    });
  });

  it("정률 할인과 추가 할인을 차례로 적용한다", () => {
    const p = toProduct(
      shopbyProduct({
        salePrice: 10000,
        immediateDiscountAmt: 10,
        immediateDiscountUnitType: "RATE",
        additionDiscountAmt: 1000,
        additionDiscountUnitType: "WON",
      }),
    );
    expect(p.discountedPrice).toBe(8000);
    expect(p.discountRate).toBe(20);
  });

  it("재고가 없거나 판매중이 아니면 품절로 표시한다", () => {
    expect(toProduct(shopbyProduct({ stockCnt: 0 })).soldOut).toBe(true);
    expect(toProduct(shopbyProduct({ saleStatusType: "STOP" })).soldOut).toBe(true);
  });
});

describe("ShopbyClient.search", () => {
  it("Shopby 헤더와 쿼리를 붙여 호출한다", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ totalCount: 1, pageCount: 1, items: [shopbyProduct()], correctedKeyword: null }),
    );
    const client = new ShopbyClient(config, fetchMock as unknown as typeof fetch);

    const result = await client.search({ q: "라면", sort: "price_asc", page: 2, size: 10 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/products/search");
    expect(url.searchParams.get("filter.keywords")).toBe("라면");
    expect(url.searchParams.get("order.by")).toBe("DISCOUNTED_PRICE");
    expect(url.searchParams.get("order.direction")).toBe("ASC");
    expect(url.searchParams.get("pageNumber")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("10");
    expect(init.headers).toMatchObject({ clientId: "test-client", version: "1.0", platform: "PC" });
    expect(result.totalCount).toBe(1);
    expect(result.items[0].discountedPrice).toBe(7990);
  });

  it("업스트림 오류를 UpstreamError로 바꾼다", async () => {
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    const client = new ShopbyClient(config, fetchMock as unknown as typeof fetch);
    await expect(client.search({ q: "x", sort: "popular", page: 1, size: 1 })).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });
});

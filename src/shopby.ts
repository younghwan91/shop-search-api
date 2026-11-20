import type { Config } from "./config.js";

/** 우리 API의 정렬 키 → Shopby order.by / order.direction */
export const SORTS = {
  popular: { by: "POPULAR", direction: "DESC" },
  recommend: { by: "MD_RECOMMEND", direction: "ASC" },
  price_asc: { by: "DISCOUNTED_PRICE", direction: "ASC" },
  price_desc: { by: "DISCOUNTED_PRICE", direction: "DESC" },
  newest: { by: "RECENT_PRODUCT", direction: "DESC" },
  sales: { by: "SALE_CNT", direction: "DESC" },
  reviews: { by: "REVIEW", direction: "DESC" },
} as const;

export type Sort = keyof typeof SORTS;

export interface SearchParams {
  q: string;
  sort: Sort;
  page: number;
  size: number;
}

/** Shopby /products/search 응답 중 우리가 쓰는 필드만 */
export interface ShopbyProduct {
  productNo: number;
  productName: string;
  brandName: string | null;
  partnerName: string | null;
  salePrice: number;
  immediateDiscountAmt: number;
  immediateDiscountUnitType: string | null;
  additionDiscountAmt: number;
  additionDiscountUnitType: string | null;
  stockCnt: number;
  saleStatusType: string;
  expirationDate: string | null;
  registerYmdt: string | null;
  saleStartYmdt: string | null;
  reviewRating: number;
  totalReviewCount: number;
  saleCnt: number;
  likeCount: number;
  promotionText: string | null;
  stickerLabels: string[] | null;
  deliveryConditionInfo: { summary: string } | null;
  listImageUrlInfo: { url: string } | null;
  imageUrls: string[] | null;
}

export interface ShopbySearchResponse {
  totalCount: number;
  pageCount: number;
  items: ShopbyProduct[];
  correctedKeyword: string | null;
}

export interface Product {
  id: number;
  name: string;
  brand: string | null;
  seller: string | null;
  price: number;
  discountedPrice: number;
  discountRate: number;
  stock: number;
  soldOut: boolean;
  expirationDate: string | null;
  /** 상품 등록 시각, KST "YYYY-MM-DD HH:mm:ss" */
  registeredAt: string | null;
  saleStartAt: string | null;
  rating: number;
  reviewCount: number;
  salesCount: number;
  likeCount: number;
  promotion: string | null;
  labels: string[];
  delivery: string | null;
  imageUrl: string | null;
  url: string;
}

export interface SearchResult {
  query: string;
  correctedQuery: string | null;
  page: number;
  size: number;
  totalCount: number;
  pageCount: number;
  items: Product[];
}

export class UpstreamError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

export class ShopbyClient {
  constructor(
    private config: Pick<Config, "shopbyBaseUrl" | "shopbyClientId" | "thirtymallApiUrl">,
    private fetchImpl: Fetch = fetch,
  ) {}

  async search(params: SearchParams): Promise<SearchResult> {
    const sort = SORTS[params.sort];
    const url = new URL("/products/search", this.config.shopbyBaseUrl);
    url.searchParams.set("filter.keywords", params.q);
    url.searchParams.set("order.by", sort.by);
    url.searchParams.set("order.direction", sort.direction);
    url.searchParams.set("pageNumber", String(params.page));
    url.searchParams.set("pageSize", String(params.size));
    url.searchParams.set("filter.totalReviewCount", "true");

    const body = await this.getJson<ShopbySearchResponse>(url, {
      clientId: this.config.shopbyClientId,
      version: "1.0",
      platform: "PC",
    });

    return {
      query: params.q,
      correctedQuery: body.correctedKeyword ?? null,
      page: params.page,
      size: params.size,
      totalCount: body.totalCount,
      pageCount: body.pageCount,
      items: body.items.map(toProduct),
    };
  }

  /** 모든 페이지를 모아서 돌려준다. 업스트림 부담 때문에 maxPages에서 끊는다. */
  async searchAll(q: string, sort: Sort, maxPages = 10): Promise<Product[]> {
    const items: Product[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.search({ q, sort, page, size: 100 });
      items.push(...res.items);
      if (page >= res.pageCount) break;
    }
    return items;
  }

  async popularKeywords(): Promise<string[]> {
    const url = new URL("/keyword/popular", this.config.thirtymallApiUrl);
    const body = await this.getJson<{ data: { keyword: string }[] }>(url, {});
    return body.data.map((d) => d.keyword);
  }

  private async getJson<T>(url: URL, headers: Record<string, string>): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new UpstreamError(504, `upstream request failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new UpstreamError(502, `upstream ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}

function applyDiscount(price: number, amount: number, unit: string | null): number {
  if (!amount) return price;
  return unit === "RATE" || unit === "PERCENT" ? price * (1 - amount / 100) : price - amount;
}

export function toProduct(p: ShopbyProduct): Product {
  const afterImmediate = applyDiscount(p.salePrice, p.immediateDiscountAmt, p.immediateDiscountUnitType);
  const discounted = Math.max(
    0,
    Math.round(applyDiscount(afterImmediate, p.additionDiscountAmt, p.additionDiscountUnitType)),
  );
  const image = p.listImageUrlInfo?.url ?? p.imageUrls?.[0] ?? null;

  return {
    id: p.productNo,
    name: p.productName,
    brand: p.brandName || null,
    seller: p.partnerName || null,
    price: p.salePrice,
    discountedPrice: discounted,
    discountRate: p.salePrice > 0 ? Math.round((1 - discounted / p.salePrice) * 100) : 0,
    stock: p.stockCnt,
    soldOut: p.saleStatusType !== "ONSALE" || p.stockCnt <= 0,
    expirationDate: p.expirationDate || null,
    registeredAt: p.registerYmdt || null,
    saleStartAt: p.saleStartYmdt || null,
    rating: p.reviewRating,
    reviewCount: p.totalReviewCount,
    salesCount: p.saleCnt,
    likeCount: p.likeCount,
    promotion: p.promotionText || null,
    labels: p.stickerLabels ?? [],
    delivery: p.deliveryConditionInfo?.summary ?? null,
    // Shopby는 프로토콜 상대 URL(//...)을 준다
    imageUrl: image ? (image.startsWith("//") ? `https:${image}` : image) : null,
    url: `https://thirtymall.com/detail?id=${p.productNo}`,
  };
}

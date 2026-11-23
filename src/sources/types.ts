export const SOURCE_IDS = ["thirtymall", "musinsa", "29cm"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const COMMON_SORTS = ["relevance", "price_asc", "price_desc", "newest"] as const;
export type CommonSort = (typeof COMMON_SORTS)[number];

/** 소스마다 다른 상품 응답을 맞춘 공통 형식. 가격은 원 단위. */
export interface Item {
  source: SourceId;
  /** 소스 안에서 고유한 상품 id */
  id: string;
  name: string;
  brand: string | null;
  /** 정가 */
  price: number;
  /** 판매가(할인 적용) */
  discountedPrice: number;
  discountRate: number;
  soldOut: boolean | null;
  imageUrl: string | null;
  url: string;
}

export interface SourceSearchParams {
  q: string;
  sort: CommonSort;
  page: number;
  size: number;
}

export interface SourceResult {
  /** 소스가 전체 개수를 알려주지 않으면 null */
  totalCount: number | null;
  items: Item[];
}

export interface Source {
  id: SourceId;
  label: string;
  sorts: readonly CommonSort[];
  /** 지원하는 마지막 페이지. 제한이 없으면 null */
  maxPage: number | null;
  maxSize: number;
  search(p: SourceSearchParams): Promise<SourceResult>;
}

/** 요청은 정상이지만 이 소스가 그 조건을 지원하지 않을 때 */
export class SourceError extends Error {
  constructor(
    public code: "unsupported_sort" | "unsupported_page",
    message: string,
  ) {
    super(message);
  }
}

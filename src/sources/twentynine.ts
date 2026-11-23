import { UpstreamError } from "../shopby.js";
import { fetchJson } from "./http.js";
import { SourceError, type Item, type Source } from "./types.js";

/**
 * 29CM 검색 API(비공식). 페이지는 limit/offset 으로 나눈다.
 * sort 파라미터는 값마다 순서가 불규칙하게 나와서(2026-11-24 확인) 관련도순만 지원한다.
 * 응답에 전체 개수가 없다.
 */
const SEARCH_URL = "https://search-api.29cm.co.kr/api/v4/products/search";
const IMAGE_HOST = "https://img.29cm.co.kr";

interface TwentynineProduct {
  itemNo: number;
  itemName: string;
  frontBrandNameKor: string | null;
  consumerPrice: number;
  lastSalePrice: number;
  lastSalePercent: number;
  isSoldOut: boolean;
  imageUrl: string | null;
}

interface TwentynineResponse {
  result: string;
  message?: string;
  data: { products: TwentynineProduct[] } | null;
}

function toItem(p: TwentynineProduct): Item {
  return {
    source: "29cm",
    id: String(p.itemNo),
    name: p.itemName,
    brand: p.frontBrandNameKor || null,
    price: p.consumerPrice,
    discountedPrice: p.lastSalePrice,
    discountRate: p.lastSalePercent,
    soldOut: p.isSoldOut,
    imageUrl: p.imageUrl ? (p.imageUrl.startsWith("http") ? p.imageUrl : `${IMAGE_HOST}${p.imageUrl}`) : null,
    url: `https://product.29cm.co.kr/catalog/${p.itemNo}`,
  };
}

export function twentynineSource(fetchImpl: typeof fetch = fetch): Source {
  return {
    id: "29cm",
    label: "29CM",
    sorts: ["relevance"],
    maxPage: null,
    maxSize: 100,
    async search({ q, sort, page, size }) {
      if (sort !== "relevance") throw new SourceError("unsupported_sort", "29cm supports relevance only");
      const url = new URL(SEARCH_URL);
      url.searchParams.set("keyword", q);
      url.searchParams.set("limit", String(size));
      url.searchParams.set("offset", String((page - 1) * size));
      const body = await fetchJson<TwentynineResponse>(url, {}, fetchImpl);
      if (body.result !== "SUCCESS" || !body.data) {
        throw new UpstreamError(502, `29cm: ${body.message ?? "unexpected response"}`);
      }
      return { totalCount: null, items: body.data.products.map(toItem) };
    },
  };
}

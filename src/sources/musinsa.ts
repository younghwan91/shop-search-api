import { UpstreamError } from "../shopby.js";
import { fetchJson } from "./http.js";
import { COMMON_SORTS, SourceError, type CommonSort, type Item, type Source } from "./types.js";

/**
 * 무신사 프론트가 쓰는 검색 API(비공식). v1 은 빈 목록을 준다.
 * 2페이지부터는 앞 응답의 nextPageUrl 에 든 서명 토큰(hmacId)이 있어야 해서 1페이지만 지원한다.
 */
const SEARCH_URL = "https://api.musinsa.com/api2/dp/v2/plp/goods";

const SORT_CODES: Record<CommonSort, string> = {
  relevance: "POPULAR",
  newest: "NEW",
  price_asc: "LOW_PRICE",
  price_desc: "HIGH_PRICE",
};

interface MusinsaGoods {
  goodsNo: number;
  goodsName: string;
  goodsLinkUrl: string;
  thumbnail: string | null;
  isSoldOut: boolean;
  normalPrice: number;
  finalPrice: number;
  brandName: string | null;
}

interface MusinsaResponse {
  data: { list: MusinsaGoods[]; pagination: { totalCount: number } } | null;
  meta: { result: string; message?: string };
}

function toItem(g: MusinsaGoods): Item {
  return {
    source: "musinsa",
    id: String(g.goodsNo),
    name: g.goodsName,
    brand: g.brandName || null,
    price: g.normalPrice,
    discountedPrice: g.finalPrice,
    discountRate: g.normalPrice > 0 ? Math.round((1 - g.finalPrice / g.normalPrice) * 100) : 0,
    soldOut: g.isSoldOut,
    imageUrl: g.thumbnail || null,
    url: g.goodsLinkUrl,
  };
}

export function musinsaSource(fetchImpl: typeof fetch = fetch): Source {
  return {
    id: "musinsa",
    label: "무신사",
    sorts: COMMON_SORTS,
    maxPage: 1,
    maxSize: 100,
    async search({ q, sort, page, size }) {
      if (page > 1) throw new SourceError("unsupported_page", "musinsa supports page 1 only");
      const url = new URL(SEARCH_URL);
      url.searchParams.set("gf", "A");
      url.searchParams.set("keyword", q);
      url.searchParams.set("sortCode", SORT_CODES[sort]);
      url.searchParams.set("page", "1");
      url.searchParams.set("size", String(size));
      url.searchParams.set("caller", "SEARCH");
      const body = await fetchJson<MusinsaResponse>(url, {}, fetchImpl);
      if (body.meta?.result !== "SUCCESS" || !body.data) {
        throw new UpstreamError(502, `musinsa: ${body.meta?.message ?? "unexpected response"}`);
      }
      return { totalCount: body.data.pagination.totalCount, items: body.data.list.map(toItem) };
    },
  };
}

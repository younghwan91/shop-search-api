import type { Product, ShopbyClient, Sort } from "../shopby.js";
import { COMMON_SORTS, type CommonSort, type Item, type Source } from "./types.js";

const SORT_MAP: Record<CommonSort, Sort> = {
  relevance: "popular",
  price_asc: "price_asc",
  price_desc: "price_desc",
  newest: "newest",
};

export function productToItem(p: Product): Item {
  return {
    source: "thirtymall",
    id: String(p.id),
    name: p.name,
    brand: p.brand,
    price: p.price,
    discountedPrice: p.discountedPrice,
    discountRate: p.discountRate,
    soldOut: p.soldOut,
    imageUrl: p.imageUrl,
    url: p.url,
  };
}

export function thirtymallSource(client: Pick<ShopbyClient, "search">): Source {
  return {
    id: "thirtymall",
    label: "떠리몰",
    sorts: COMMON_SORTS,
    maxPage: 500,
    maxSize: 100,
    async search({ q, sort, page, size }) {
      const res = await client.search({ q, sort: SORT_MAP[sort], page, size });
      return { totalCount: res.totalCount, items: res.items.map(productToItem) };
    },
  };
}

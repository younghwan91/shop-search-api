import { z } from "zod";
import { matchesBrand, type BrandRule } from "./brands.js";
import type { TtlCache } from "./cache.js";
import { UpstreamError } from "./shopby.js";
import {
  COMMON_SORTS,
  SOURCE_IDS,
  SourceError,
  type CommonSort,
  type Item,
  type Source,
  type SourceId,
  type SourceResult,
  type SourceSearchParams,
} from "./sources/types.js";

export type MultiSearchResult =
  | { source: SourceId; ok: true; totalCount: number | null; excludedCount?: number; items: Item[] }
  | { source: SourceId; ok: false; error: "unsupported_sort" | "unsupported_page" | "upstream_error"; message: string };

export interface MultiSearchResponse {
  query: string;
  sort: CommonSort;
  page: number;
  size: number;
  brand?: string;
  results: MultiSearchResult[];
}

/** "musinsa, 29cm,musinsa" → ["musinsa", "29cm"]. 모르는 값이나 빈 목록이면 400. */
const sourcesSchema = z
  .string()
  .transform((raw) => [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))])
  .pipe(z.array(z.enum(SOURCE_IDS)).min(1, "sources is empty"));

export const multiSearchQuery = (brandKeys: (b: string) => boolean) =>
  z.object({
    q: z.string().trim().min(1, "q is required").max(100),
    sources: sourcesSchema,
    sort: z.enum(COMMON_SORTS).default("relevance"),
    brand: z.string().refine(brandKeys, "unknown brand").optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
    size: z.coerce.number().int().min(1).max(100).default(20),
  });

/** 새 소스는 상품명에 브랜드가 빠진 경우가 많아(무신사) 브랜드를 머리표처럼 붙여 판정한다. */
export function brandText(item: Item): string {
  return item.brand ? `[${item.brand}] ${item.name}` : item.name;
}

export async function searchSources(
  sources: Source[],
  p: SourceSearchParams,
  opts: { brand?: BrandRule; cache: TtlCache<SourceResult> },
): Promise<MultiSearchResult[]> {
  const settled = await Promise.allSettled(
    sources.map((s) => opts.cache.get(JSON.stringify([s.id, p.q, p.sort, p.page, p.size]), () => s.search(p))),
  );
  return settled.map((r, i): MultiSearchResult => {
    const source = sources[i].id;
    if (r.status === "rejected") {
      const err = r.reason as Error;
      if (err instanceof SourceError) return { source, ok: false, error: err.code, message: err.message };
      if (err instanceof UpstreamError) return { source, ok: false, error: "upstream_error", message: err.message };
      return { source, ok: false, error: "upstream_error", message: String(err?.message ?? err) };
    }
    const { totalCount, items } = r.value;
    if (!opts.brand) return { source, ok: true, totalCount, items };
    const rule = opts.brand;
    const kept = items.filter((it) => matchesBrand({ name: brandText(it) }, rule));
    return { source, ok: true, totalCount, excludedCount: items.length - kept.length, items: kept };
  });
}

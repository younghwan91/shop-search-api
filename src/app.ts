import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { loadBrands, matchesBrand, type Brands } from "./brands.js";
import { TtlCache } from "./cache.js";
import type { Config } from "./config.js";
import { multiSearchQuery, searchSources } from "./multi-search.js";
import { SORTS, ShopbyClient, UpstreamError, type Product, type SearchResult, type Sort } from "./shopby.js";
import { defaultSources } from "./sources/index.js";
import type { Source, SourceId, SourceResult } from "./sources/types.js";

export function buildApp(
  config: Config,
  client = new ShopbyClient(config),
  brands: Brands = loadBrands(),
  sources: Record<SourceId, Source> = defaultSources(client),
) {
  const searchQuery = z.object({
    q: z.string().trim().min(1, "q is required").max(100),
    sort: z.enum(Object.keys(SORTS) as [Sort, ...Sort[]]).default("popular"),
    brand: z
      .string()
      .refine((b) => Object.hasOwn(brands, b), "unknown brand")
      .optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
    size: z.coerce.number().int().min(1).max(100).default(20),
  });
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const searchCache = new TtlCache<SearchResult>(config.cacheTtlMs);
  const allCache = new TtlCache<Product[]>(config.cacheTtlMs);
  const keywordCache = new TtlCache<string[]>(config.cacheTtlMs * 5);
  const sourceCache = new TtlCache<SourceResult>(config.cacheTtlMs);
  const multiQuery = multiSearchQuery((b) => Object.hasOwn(brands, b));

  app.register(rateLimit, { max: config.rateLimitPerMinute, timeWindow: "1 minute" });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof UpstreamError) {
      return reply.status(err.status).send({ error: "upstream_error", message: err.message });
    }
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: "invalid_request", issues: err.issues });
    }
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) return reply.send(err);
    app.log.error(err);
    return reply.status(500).send({ error: "internal_error" });
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/search", async (req) => {
    if ((req.query as Record<string, unknown>).sources !== undefined) {
      // 여러 소스 검색. sources 가 없을 때의 기존 응답은 아래 코드 그대로 둔다(떠리몰 크론·기존 호출 보호).
      const { sources: ids, brand, ...p } = multiQuery.parse(req.query);
      const results = await searchSources(
        ids.map((id) => sources[id]),
        p,
        { brand: brand ? brands[brand] : undefined, cache: sourceCache },
      );
      return { query: p.q, sort: p.sort, page: p.page, size: p.size, ...(brand ? { brand } : {}), results };
    }
    const { brand, ...params } = searchQuery.parse(req.query);
    if (!brand) {
      return searchCache.get(JSON.stringify(params), () => client.search(params));
    }

    // 브랜드 필터는 업스트림에 없어서 전체를 받아 걸러낸 뒤 여기서 페이지를 나눈다
    const all = await allCache.get(JSON.stringify([params.q, params.sort]), () =>
      client.searchAll(params.q, params.sort),
    );
    const filtered = all.filter((p) => matchesBrand(p, brands[brand]));
    const start = (params.page - 1) * params.size;
    return {
      query: params.q,
      correctedQuery: null,
      brand,
      page: params.page,
      size: params.size,
      totalCount: filtered.length,
      pageCount: Math.ceil(filtered.length / params.size),
      excludedCount: all.length - filtered.length,
      items: filtered.slice(start, start + params.size),
    };
  });

  app.get("/sources", async () => ({
    sources: Object.values(sources).map(({ id, label, sorts, maxPage }) => ({ id, label, sorts, maxPage })),
  }));

  app.get("/keywords/popular", async () => ({
    keywords: await keywordCache.get("popular", () => client.popularKeywords()),
  }));

  return app;
}

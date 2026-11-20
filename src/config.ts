export interface Config {
  port: number;
  host: string;
  shopbyClientId: string;
  shopbyBaseUrl: string;
  thirtymallApiUrl: string;
  cacheTtlMs: number;
  rateLimitPerMinute: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "0.0.0.0",
    shopbyClientId: env.SHOPBY_CLIENT_ID ?? "UoI6WXPCVmuu7u/mv6tH2g==",
    shopbyBaseUrl: env.SHOPBY_BASE_URL ?? "https://shop-api.e-ncp.com",
    thirtymallApiUrl: env.THIRTYMALL_API_URL ?? "https://api.thirtymall.com",
    cacheTtlMs: Number(env.CACHE_TTL_SECONDS ?? 60) * 1000,
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 60),
  };
}

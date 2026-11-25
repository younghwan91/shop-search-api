/**
 * 오프라인 데모: 업스트림(떠리몰·무신사·29CM)으로 나가는 fetch 를 고정 데이터로 바꿔 끼운 채 서버를 띄운다.
 * 키도 네트워크도 필요 없고, 쇼핑몰에는 요청이 한 번도 나가지 않는다.
 * 떠리몰은 demo/thirtymall.synthetic.json(합성), 무신사·29CM 은 test/fixtures 에 저장된 응답이다.
 * 검색어와 상관없이 같은 고정 응답이 나오는 곳은 무신사·29CM 이다.
 */
import { readFileSync } from "node:fs";

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const thirtymall = read("../demo/thirtymall.synthetic.json");
const musinsa = read("../test/fixtures/musinsa.json");
const twentynine = read("../test/fixtures/29cm.json");

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

export const demoFetch: typeof fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const p = url.searchParams;
  if (url.hostname === "shop-api.e-ncp.com" && url.pathname === "/products/search") {
    const q = (p.get("filter.keywords") ?? "").replace(/\s+/g, "");
    const hits = (thirtymall.products as { productName: string }[]).filter((x) => x.productName.replace(/\s+/g, "").includes(q));
    const size = Number(p.get("pageSize") ?? 20);
    const page = Number(p.get("pageNumber") ?? 1);
    return json({
      totalCount: hits.length,
      pageCount: Math.max(1, Math.ceil(hits.length / size)),
      items: hits.slice((page - 1) * size, page * size),
      correctedKeyword: null,
    });
  }
  if (url.hostname === "api.thirtymall.com" && url.pathname === "/keyword/popular") {
    return json({ data: (thirtymall.keywords as string[]).map((keyword) => ({ keyword })) });
  }
  if (url.hostname === "api.musinsa.com") return json(musinsa);
  if (url.hostname === "search-api.29cm.co.kr") return json(twentynine);
  throw new Error(`demo mode: network access to ${url.hostname} is blocked`);
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  globalThis.fetch = demoFetch;
  process.env.BRANDS_FILE ??= "brands.example.json";
  process.env.HOST ??= "127.0.0.1";
  await import("./server.js");
}

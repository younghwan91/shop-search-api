/**
 * 기존 동작 고정 테스트. 심노드 크론(`node dist/watch.js`)이 떠리몰 폴로 감시를 돌리고 있어서,
 * 소스를 늘리는 동안 기존 감시·검색의 바깥 모습(디스코드 본문, 상태 파일, 업스트림 요청, /search 응답)이
 * 조금이라도 바뀌면 여기서 깨져야 한다. 스냅샷을 고치기 전에 크론 결과가 바뀌는지부터 확인할 것.
 */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { compileBrands } from "../src/brands.js";
import { loadConfig } from "../src/config.js";
import { notifyDiscord } from "../src/discord.js";
import { ShopbyClient, type ShopbyProduct } from "../src/shopby.js";
import { runWatch, type WatchOptions } from "../src/watch.js";
import { shopbyProduct } from "./fixtures.js";
import example from "../brands.example.json" with { type: "json" };

const WEBHOOK = "https://discord.example/webhook";
const config = { ...loadConfig({}), rateLimitPerMinute: 1000 };

function fakeUpstream(catalog: () => ShopbyProduct[]) {
  const searchCalls: { url: string; headers: unknown }[] = [];
  const webhookBodies: unknown[] = [];
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(WEBHOOK)) {
      webhookBodies.push(JSON.parse(init!.body as string));
      return new Response(null, { status: 204 });
    }
    if (url.startsWith("https://shop-api.e-ncp.com/products/search")) {
      searchCalls.push({ url, headers: init?.headers });
      const items = catalog();
      return Response.json({ totalCount: items.length, pageCount: 1, items, correctedKeyword: null });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { fetchImpl, searchCalls, webhookBodies };
}

describe("기존 감시(크론) 고정", () => {
  it("기존 감시 한 사이클의 디스코드 본문과 상태 파일이 그대로다", async () => {
    let catalog = [
      shopbyProduct({ productNo: 1, productName: "[에이크미] 볼캡", registerYmdt: "2026-11-19 10:00:00" }),
      shopbyProduct({ productNo: 2, productName: "[에이크미클럽] 부츠" }),
    ];
    const up = fakeUpstream(() => catalog);
    const dir = await mkdtemp(join(tmpdir(), "legacy-"));
    const opts: WatchOptions = {
      query: "에이크미",
      brand: compileBrands(example).acme,
      stateFile: join(dir, "seen.json"),
      webhookUrl: WEBHOOK,
    };
    const client = new ShopbyClient(config, up.fetchImpl);
    const notify = (h: string, p: Parameters<typeof notifyDiscord>[2]) => notifyDiscord(WEBHOOK, h, p, up.fetchImpl);

    await runWatch(opts, client, notify);
    catalog = [
      ...catalog,
      shopbyProduct({
        productNo: 3,
        productName: "[에이크미] 맨투맨",
        registerYmdt: "2026-11-20 09:00:00",
        salePrice: 30000,
        immediateDiscountAmt: 10,
        immediateDiscountUnitType: "RATE",
        stockCnt: 0,
      }),
    ];
    const res = await runWatch(opts, client, notify);

    expect(res).toMatchObject({ firstRun: false, total: 2 });
    expect(up.webhookBodies).toMatchInlineSnapshot(`
      [
        {
          "content": "🆕 떠리몰 에이크미 새 상품 1개",
          "embeds": [
            {
              "color": 2046611,
              "description": "~~30,000원~~ → **27,000원** (10%)",
              "fields": [
                {
                  "inline": true,
                  "name": "재고",
                  "value": "품절",
                },
                {
                  "inline": true,
                  "name": "등록",
                  "value": "2026-11-20 09:00:00",
                },
              ],
              "thumbnail": {
                "url": "https://thirtymall.cdn-nhncommerce.com/a.webp",
              },
              "title": "[에이크미] 맨투맨",
              "url": "https://thirtymall.com/detail?id=3",
            },
          ],
        },
      ]
    `);
    const stateText = await readFile(opts.stateFile, "utf8");
    expect(stateText).toBe(JSON.stringify(JSON.parse(stateText), null, 2));
    expect(JSON.parse(stateText)).toMatchInlineSnapshot(`
      {
        "seenIds": [
          1,
          3,
        ],
      }
    `);
  });

  it("Shopby 요청 URL·헤더가 그대로다", async () => {
    const up = fakeUpstream(() => [shopbyProduct()]);
    await new ShopbyClient(config, up.fetchImpl).searchAll("폴로", "newest");
    expect(up.searchCalls).toMatchInlineSnapshot(`
      [
        {
          "headers": {
            "Accept": "application/json",
            "clientId": "UoI6WXPCVmuu7u/mv6tH2g==",
            "platform": "PC",
            "version": "1.0",
          },
          "url": "https://shop-api.e-ncp.com/products/search?filter.keywords=%ED%8F%B4%EB%A1%9C&order.by=RECENT_PRODUCT&order.direction=DESC&pageNumber=1&pageSize=100&filter.totalReviewCount=true",
        },
      ]
    `);
  });

  it("sources 없는 GET /search 응답이 그대로다", async () => {
    const up = fakeUpstream(() => [shopbyProduct()]);
    const app = buildApp(config, new ShopbyClient(config, up.fetchImpl), compileBrands(example));
    const res = await app.inject({ url: "/search?q=a" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchInlineSnapshot(`
      {
        "correctedQuery": null,
        "items": [
          {
            "brand": "#2.MD추천",
            "delivery": "무료배송",
            "discountRate": 84,
            "discountedPrice": 7990,
            "expirationDate": "2026-12-01",
            "id": 138032171,
            "imageUrl": "https://thirtymall.cdn-nhncommerce.com/a.webp",
            "labels": [
              "소비기한",
              "매입무료배송",
            ],
            "likeCount": 90,
            "name": "누들컬 단백질 컵라면 99g*16개입",
            "price": 50400,
            "promotion": "개당 약 500원대",
            "rating": 4.5,
            "registeredAt": "2026-11-16 09:57:05",
            "reviewCount": 24,
            "saleStartAt": "2026-11-16 00:00:00",
            "salesCount": 330,
            "seller": "버터플라이어 주식회사",
            "soldOut": false,
            "stock": 459,
            "url": "https://thirtymall.com/detail?id=138032171",
          },
        ],
        "page": 1,
        "pageCount": 1,
        "query": "a",
        "size": 20,
        "totalCount": 1,
      }
    `);
  });
});

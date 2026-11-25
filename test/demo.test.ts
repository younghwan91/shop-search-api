import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { ShopbyClient } from "../src/shopby.js";
import { defaultSources } from "../src/sources/index.js";
import { musinsaSource } from "../src/sources/musinsa.js";
import { twentynineSource } from "../src/sources/twentynine.js";
import { demoFetch } from "../src/demo.js";

describe("npm run demo 의 고정 fetch", () => {
  const config = loadConfig({});
  const client = new ShopbyClient(config, demoFetch);
  const sources = { ...defaultSources(client), musinsa: musinsaSource(demoFetch), "29cm": twentynineSource(demoFetch) };
  const app = buildApp(config, client, {}, sources);

  it("세 쇼핑몰을 한 번에 검색한다", async () => {
    const res = await app.inject({ url: "/search?q=" + encodeURIComponent("라면") + "&sources=thirtymall,musinsa,29cm" });
    expect(res.statusCode).toBe(200);
    const { results } = res.json();
    expect(results.map((r: { ok: boolean }) => r.ok)).toEqual([true, true, true]);
    expect(results[0].items.length).toBe(2);
  });

  it("알 수 없는 호스트로는 나가지 않는다", async () => {
    await expect(demoFetch("https://example.com/")).rejects.toThrow(/blocked/);
  });
});

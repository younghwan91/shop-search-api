import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compileBrands } from "../src/brands.js";
import { notifyDiscord } from "../src/discord.js";
import { toProduct, type Product } from "../src/shopby.js";
import { findNew, runWatch, type WatchOptions } from "../src/watch.js";
import { shopbyProduct } from "./fixtures.js";
import example from "../brands.example.json" with { type: "json" };

const { acme } = compileBrands(example);

const product = (id: number, name: string, registerYmdt = "2026-11-19 10:00:00"): Product =>
  toProduct(shopbyProduct({ productNo: id, productName: name, registerYmdt }));

describe("findNew", () => {
  it("본 적 없는 상품만 등록순으로 돌려준다", () => {
    const current = [
      product(3, "c", "2026-11-19 13:00:00"),
      product(2, "b", "2026-11-19 09:00:00"),
      product(1, "a"),
    ];
    expect(findNew(current, [1]).map((p) => p.id)).toEqual([2, 3]);
  });
});

describe("runWatch", () => {
  let opts: WatchOptions;
  let catalog: Product[];
  const client = { searchAll: vi.fn(async () => catalog) };

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "watch-"));
    opts = { query: "에이크미", brand: acme, stateFile: join(dir, "seen.json"), webhookUrl: "x" };
    catalog = [product(1, "[ACME] 에이크미 맨투맨"), product(2, "[에이크미클럽] 부츠")];
  });

  it("첫 실행은 기준선만 저장하고 알리지 않는다", async () => {
    const notify = vi.fn(async () => {});
    const res = await runWatch(opts, client, notify);
    expect(res.firstRun).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(opts.stateFile, "utf8")).seenIds).toEqual([1]);
  });

  it("브랜드에 맞는 새 상품만 알린다", async () => {
    const notify = vi.fn(async () => {});
    await runWatch(opts, client, notify);
    catalog = [...catalog, product(3, "[에이크미] 볼캡"), product(4, "[다른브랜드] 에이크미 스타일 셔츠")];

    const res = await runWatch(opts, client, notify);

    expect(res.newProducts.map((p) => p.id)).toEqual([3]);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0]).toContain("새 상품 1개");
  });

  it("알림 전송이 실패하면 상태를 저장하지 않아 다음에 다시 보낸다", async () => {
    await runWatch(opts, client, async () => {});
    catalog = [...catalog, product(3, "[에이크미] 볼캡")];

    await expect(runWatch(opts, client, async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    const notify = vi.fn(async () => {});
    const res = await runWatch(opts, client, notify);
    expect(res.newProducts.map((p) => p.id)).toEqual([3]);
  });

  it("새 상품이 없으면 알리지 않는다", async () => {
    await runWatch(opts, client, async () => {});
    const notify = vi.fn(async () => {});
    await runWatch(opts, client, notify);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("notifyDiscord", () => {
  it("embed를 10개씩 나눠 보내고 첫 메시지에만 제목을 붙인다", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const items = Array.from({ length: 12 }, (_, i) => product(i + 1, `상품 ${i + 1}`));

    await notifyDiscord("https://discord.example/webhook", "제목", items, fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0].content).toBe("제목");
    expect(bodies[0].embeds).toHaveLength(10);
    expect(bodies[1].content).toBeUndefined();
    expect(bodies[1].embeds).toHaveLength(2);
    expect(bodies[0].embeds[0]).toMatchObject({ url: "https://thirtymall.com/detail?id=1" });
    expect(bodies[0].embeds[0].description).toContain("7,990원");
  });

  it("웹훅 오류면 예외", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 404 }));
    await expect(
      notifyDiscord("https://x", "t", [product(1, "a")], fetchMock as unknown as typeof fetch),
    ).rejects.toThrow("404");
  });
});

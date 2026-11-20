import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { loadBrands, matchesBrand, type BrandRule } from "./brands.js";
import { loadConfig } from "./config.js";
import { notifyDiscord } from "./discord.js";
import { ShopbyClient, type Product } from "./shopby.js";

export interface WatchOptions {
  query: string;
  brand: BrandRule | undefined;
  stateFile: string;
  webhookUrl: string | undefined;
}

interface State {
  seenIds: number[];
}

async function loadState(file: string): Promise<State | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as State;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function saveState(file: string, state: State) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 2));
}

/** 이전에 본 적 없는 상품만, 오래된 등록순으로 */
export function findNew(current: Product[], seenIds: Iterable<number>): Product[] {
  const seen = new Set(seenIds);
  return current
    .filter((p) => !seen.has(p.id))
    .sort((a, b) => (a.registeredAt ?? "").localeCompare(b.registeredAt ?? ""));
}

export interface WatchResult {
  firstRun: boolean;
  total: number;
  newProducts: Product[];
}

/**
 * 한 번 확인한다. 첫 실행은 현재 상품을 기준선으로 저장만 하고 알리지 않는다.
 * 알림 전송에 실패하면 상태를 저장하지 않아 다음 실행에서 다시 보낸다.
 */
export async function runWatch(
  opts: WatchOptions,
  client: Pick<ShopbyClient, "searchAll">,
  notify: (heading: string, products: Product[]) => Promise<void>,
): Promise<WatchResult> {
  const all = await client.searchAll(opts.query, "newest");
  const current = opts.brand ? all.filter((p) => matchesBrand(p, opts.brand!)) : all;
  const state = await loadState(opts.stateFile);

  if (!state) {
    await saveState(opts.stateFile, { seenIds: current.map((p) => p.id) });
    return { firstRun: true, total: current.length, newProducts: [] };
  }

  const newProducts = findNew(current, state.seenIds);
  if (newProducts.length > 0) {
    const label = opts.brand?.label ?? opts.query;
    await notify(`🆕 떠리몰 ${label} 새 상품 ${newProducts.length}개`, newProducts);
  }
  // 내려간 상품 id도 남겨둔다. 다시 올라와도 새 상품으로 치지 않는다.
  const seenIds = [...new Set([...state.seenIds, ...current.map((p) => p.id)])];
  await saveState(opts.stateFile, { seenIds });
  return { firstRun: false, total: current.length, newProducts };
}

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // .env 없으면 환경변수만 쓴다
  }
  const config = loadConfig();
  const query = process.env.WATCH_QUERY;
  if (!query) throw new Error("WATCH_QUERY is not set (.env)");
  // 비워두면 브랜드 필터 없이 검색어 전체를 본다
  const brandKey = process.env.WATCH_BRAND || undefined;
  const brands = loadBrands();
  if (brandKey && !Object.hasOwn(brands, brandKey)) throw new Error(`unknown WATCH_BRAND: ${brandKey} (brands.json)`);

  const opts: WatchOptions = {
    query,
    brand: brandKey ? brands[brandKey] : undefined,
    stateFile: process.env.WATCH_STATE_FILE ?? "data/seen.json",
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  };
  const dryRun = process.argv.includes("--dry-run");
  if (!opts.webhookUrl && !dryRun) throw new Error("DISCORD_WEBHOOK_URL is not set (.env)");

  const notify = dryRun
    ? async (heading: string, products: Product[]) => {
        console.log(heading);
        for (const p of products) console.log(` - ${p.registeredAt} ${p.name} ${p.url}`);
      }
    : (heading: string, products: Product[]) => notifyDiscord(opts.webhookUrl!, heading, products);

  const result = await runWatch(opts, new ShopbyClient(config), notify);
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  console.log(
    result.firstRun
      ? `[${now}] 첫 실행: 현재 ${result.total}개를 기준으로 저장했습니다 (알림 없음)`
      : `[${now}] ${result.total}개 확인, 새 상품 ${result.newProducts.length}개`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

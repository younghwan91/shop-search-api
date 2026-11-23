# 무신사·29CM 검색 소스와 레포 이름 변경 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /search?sources=` 로 떠리몰·무신사·29CM 을 한 번에 검색하고, 레포 이름을 `shop-search-api` 로 바꾼다. 폴로 크론 결과는 그대로.

**Architecture:** `src/sources/` 에 소스마다 `Source.search()` 어댑터를 두고 공통 `Item` 으로 돌려준다. `app.ts` 는 `sources` 가 있을 때만 새 경로를 타고, 없으면 기존 코드 경로를 그대로 쓴다. 기존 `watch.ts`·`discord.ts`·`shopby.ts` 는 수정하지 않는다.

**Tech Stack:** Node ≥22, TypeScript 5.9 (ESM, `.js` import 접미사), Fastify 5, zod 3, vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-multi-source-design.md`

**작업 위치:** 워크트리 `/home/young/orca/workspaces/thirtymall-search-api/multi-source` (브랜치 `younghwan91/multi-source`). main 체크아웃 `/home/young/git/thirtymall-search-api` 는 읽기만 한다.

## Global Constraints

- `src/watch.ts`, `src/discord.ts`, `src/shopby.ts`, `src/brands.ts` 는 수정하지 않는다(`git diff main -- src/watch.ts src/discord.ts src/shopby.ts src/brands.ts` 가 비어야 한다).
- `sources` 없는 `GET /search` 응답, `/keywords/popular`, `/health` 는 지금과 같다.
- main 체크아웃의 `dist/`, `data/`, `.env`, `brands.json`, 크론, 로컬 폴더 경로, Orca 등록은 건드리지 않는다. main 에서 `npm run build` 금지.
- `.env`·`brands.json` 은 열어 보지 않는다. 필요하면 `set -a; . /home/young/git/thirtymall-search-api/.env; set +a`, `BRANDS_FILE=/home/young/git/thirtymall-search-api/brands.json` 로 넘긴다.
- `--dry-run` 은 상태 파일을 쓴다 → 항상 `WATCH_STATE_FILE=<scratch 복사본>`.
- 무신사: `GET https://api.musinsa.com/api2/dp/v2/plp/goods?gf=A&keyword=…&sortCode=…&page=1&size=…&caller=SEARCH`. 정렬: relevance→`POPULAR`, newest→`NEW`, price_asc→`LOW_PRICE`, price_desc→`HIGH_PRICE`. page ≥2 는 서명 토큰(hmacId)이 필요하므로 지원하지 않는다(`unsupported_page`). size ≤100.
- 29CM: `GET https://search-api.29cm.co.kr/api/v4/products/search?keyword=…&limit=<size>&offset=<(page-1)*size>`. 정렬 파라미터는 결과가 불규칙해서 쓰지 않는다 → relevance 만. 이미지 `https://img.29cm.co.kr` + `imageUrl`, 상품 `https://product.29cm.co.kr/catalog/<itemNo>`. 응답에 전체 개수 없음 → `totalCount: null`.
- 차단 우회(헤더 위장 반복, 프록시 등) 금지. 요청 타임아웃 10초.
- 커밋 메시지는 영어 Conventional Commits, 본문에 이유, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 문서(README·guide)는 한국어 합니다체.

## Review Focus

1. 무신사에 `page=2` → 무신사만 `ok:false, error:"unsupported_page"`, 나머지 소스는 정상 (Task 3, Task 5 테스트).
2. 업스트림이 HTTP 200 에 실패 본문(무신사 `meta.result:"FAIL"`, `data:null`)을 주면 그 소스만 `upstream_error` (Task 3 테스트).
3. `sources` 에 공백·중복·빈 칸(`" musinsa,,29cm,musinsa"`) → `["musinsa","29cm"]` 로 정리, 전부 비면 400 (Task 5 테스트).
4. `sources` 와 함께 기존 정렬값(`sort=popular`) → 400 `invalid_request` (Task 5 테스트).
5. 업스트림 오류는 캐시되지 않아 다음 요청에서 다시 시도 (Task 5 테스트, 기존 `TtlCache` 동작 활용).

---

### Task 1: 기존 감시·검색 고정 테스트

**Files:**
- Create: `test/legacy-watch.test.ts`

**Interfaces:**
- Consumes: `runWatch`, `WatchOptions` (`src/watch.ts`), `notifyDiscord` (`src/discord.ts`), `ShopbyClient` (`src/shopby.ts`), `buildApp`, `shopbyProduct` (`test/fixtures.ts`).
- Produces: 없음(보호용 테스트).

- [ ] **Step 1: 테스트 작성** — 가짜 fetch 하나가 URL 로 갈라서 응답한다: `shop-api.e-ncp.com/products/search` → `{totalCount, pageCount:1, items:[shopbyProduct(...)…], correctedKeyword:null}`, 디스코드 웹훅 URL → 204 이고 요청 본문을 모은다. 실제 `new ShopbyClient(loadConfig({}), fakeFetch)` 와 `(h, p) => notifyDiscord(url, h, p, fakeFetch)` 로 `runWatch` 를 두 번 돌린다(1회차 기준선, 2회차에 상품 1개 추가).
  - `it("기존 감시 한 사이클의 디스코드 본문과 상태 파일이 그대로다")`: `expect(webhookBodies).toMatchInlineSnapshot()`, `expect(JSON.parse(stateFileText)).toMatchInlineSnapshot()`, `expect(stateFileText).toBe(JSON.stringify(parsed, null, 2))`(포맷 고정).
  - `it("Shopby 요청 URL·헤더가 그대로다")`: 첫 검색 호출의 URL 문자열과 headers 를 인라인 스냅샷.
  - `it("sources 없는 GET /search 응답이 그대로다")`: `buildApp(config, new ShopbyClient(config, fakeFetch), compileBrands(example))` 에 `/search?q=a` 를 inject 하고 `res.json()` 인라인 스냅샷.
- [ ] **Step 2: 실행해 스냅샷 생성** — `npx vitest run test/legacy-watch.test.ts -u` → PASS, 파일에 인라인 스냅샷이 채워진다. 채워진 값이 `toProduct`/`productEmbed` 결과와 맞는지 눈으로 확인(제목 `🆕 떠리몰 … 새 상품 1개`, url `https://thirtymall.com/detail?id=…`).
- [ ] **Step 3: 재실행** — `npx vitest run` → 전부 PASS.
- [ ] **Step 4: 커밋** — `test: pin legacy watch and search output before adding sources`

### Task 2: 공통 타입, HTTP 헬퍼, 떠리몰 소스

**Files:**
- Create: `src/sources/types.ts`, `src/sources/http.ts`, `src/sources/thirtymall.ts`
- Test: `test/sources.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `SourceId = "thirtymall" | "musinsa" | "29cm"`, `SOURCE_IDS: readonly SourceId[]`, `CommonSort = "relevance" | "price_asc" | "price_desc" | "newest"`, `COMMON_SORTS`, `Item`(스펙 그대로), `SourceSearchParams = { q: string; sort: CommonSort; page: number; size: number }`, `SourceResult = { totalCount: number | null; items: Item[] }`, `Source = { id: SourceId; label: string; sorts: readonly CommonSort[]; maxPage: number | null; maxSize: number; search(p: SourceSearchParams): Promise<SourceResult> }`, `class SourceError extends Error { constructor(public code: "unsupported_sort" | "unsupported_page", message: string) }`.
  - `http.ts`: `fetchJson<T>(url: URL, headers: Record<string,string>, fetchImpl?: typeof fetch): Promise<T>` — 네트워크 실패 `UpstreamError(504)`, 비정상 상태 `UpstreamError(502, "upstream <status>: <본문 200자>")`, 타임아웃 10초, 기본 헤더 `Accept: application/json` + 브라우저형 `User-Agent` 한 개(고정 문자열).
  - `thirtymall.ts`: `thirtymallSource(client: Pick<ShopbyClient, "search">): Source` (label `떠리몰`, sorts 4개 전부, maxPage 500, maxSize 100), `productToItem(p: Product): Item`.
- Consumes: `UpstreamError`, `Product`, `ShopbyClient` (`src/shopby.ts`, import 만).

- [ ] **Step 1: 실패 테스트** — `describe("thirtymallSource")`:
  - relevance→`client.search` 에 `sort:"popular"`, price_asc→`"price_asc"`, price_desc→`"price_desc"`, newest→`"newest"` 로 넘긴다.
  - `productToItem(toProduct(shopbyProduct()))` → `{ source:"thirtymall", id:"138032171", name:"누들컬 단백질 컵라면 99g*16개입", brand:"#2.MD추천", price:50400, discountedPrice:7990, discountRate:84, soldOut:false, url:"https://thirtymall.com/detail?id=138032171" }` 를 포함.
  - `describe("fetchJson")`: 500 응답 → `UpstreamError` status 502, fetch reject → status 504.
- [ ] **Step 2: 실행** — `npx vitest run test/sources.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: 구현** — 위 Interfaces 대로.
- [ ] **Step 4: 실행** — `npx vitest run && npm run typecheck` → PASS.
- [ ] **Step 5: 커밋** — `feat(sources): add common source types and thirtymall adapter`

### Task 3: 무신사 소스

**Files:**
- Create: `src/sources/musinsa.ts`, `test/fixtures/musinsa.json`(실제 응답에서 상품 2개만 남긴 것; 하나는 할인 상품으로 값 조정)
- Test: `test/sources.test.ts` (추가)

**Interfaces:**
- Produces: `musinsaSource(fetchImpl?: typeof fetch): Source` — id `musinsa`, label `무신사`, sorts 4개, maxPage 1, maxSize 100.
- Consumes: `fetchJson`, `SourceError`, 타입들 (Task 2).

- [ ] **Step 1: 픽스처 만들기** — `curl -s 'https://api.musinsa.com/api2/dp/v2/plp/goods?gf=A&keyword=%ED%8F%B4%EB%A1%9C&sortCode=POPULAR&page=1&size=2&caller=SEARCH'` 결과를 저장하고 `clickTrackers`·`impressionTrackers`·`nextPageUrl` 은 지운다. 두 번째 상품은 `normalPrice:100000, finalPrice:70000` 으로 고친다.
- [ ] **Step 2: 실패 테스트** — `describe("musinsaSource")`:
  - 요청 URL: `sort:"price_asc", size:30` → `sortCode=LOW_PRICE`, `size=30`, `page=1`, `keyword=` 인코딩, `gf=A`, `caller=SEARCH`.
  - 매핑: `id: String(goodsNo)`, `name: goodsName`, `brand: brandName`, `price: normalPrice`, `discountedPrice: finalPrice`, `discountRate: Math.round((1 - finalPrice/normalPrice)*100)`(두 번째 상품 → 30), `soldOut: isSoldOut`, `imageUrl: thumbnail`, `url: goodsLinkUrl`, `totalCount: data.pagination.totalCount`.
  - `page:2` → `SourceError` code `unsupported_page`, fetch 호출 없음.
  - 본문 `{"data":null,"meta":{"result":"FAIL","errorCode":"DISPLAY_000_0004","message":"잘못된 접근입니다."}}`(HTTP 200) → `UpstreamError` status 502, 메시지에 `잘못된 접근입니다.` 포함.
- [ ] **Step 3: 실행** — FAIL.
- [ ] **Step 4: 구현.**
- [ ] **Step 5: 실행** — `npx vitest run && npm run typecheck` → PASS.
- [ ] **Step 6: 커밋** — `feat(sources): add musinsa search adapter`

### Task 4: 29CM 소스

**Files:**
- Create: `src/sources/twentynine.ts`, `test/fixtures/29cm.json`(실제 응답에서 상품 2개, 하나는 `imageUrl` 없는 것으로)
- Test: `test/sources.test.ts` (추가)

**Interfaces:**
- Produces: `twentynineSource(fetchImpl?: typeof fetch): Source` — id `29cm`, label `29CM`, sorts `["relevance"]`, maxPage null, maxSize 100.
- Consumes: Task 2.

- [ ] **Step 1: 픽스처** — `curl -s 'https://search-api.29cm.co.kr/api/v4/products/search?keyword=%ED%8F%B4%EB%A1%9C&limit=2'` 저장, 두 번째 상품의 `imageUrl` 을 `null` 로.
- [ ] **Step 2: 실패 테스트** — `describe("twentynineSource")`:
  - `page:3, size:20` → URL 에 `limit=20&offset=40`, `sort` 파라미터 없음.
  - `sort:"newest"` → `SourceError` `unsupported_sort`, fetch 호출 없음.
  - 매핑: `id: String(itemNo)`, `name: itemName`, `brand: frontBrandNameKor`, `price: consumerPrice`, `discountedPrice: lastSalePrice`, `discountRate: lastSalePercent`, `soldOut: isSoldOut`, `imageUrl: "https://img.29cm.co.kr" + imageUrl`(없으면 null), `url: "https://product.29cm.co.kr/catalog/" + itemNo`, `totalCount: null`.
  - `result` 가 `"SUCCESS"` 가 아니면 `UpstreamError` 502.
- [ ] **Step 3: 실행** — FAIL. **Step 4: 구현.** **Step 5: 실행** — PASS(+typecheck).
- [ ] **Step 6: 커밋** — `feat(sources): add 29cm search adapter`

### Task 5: 다중 소스 `/search` 와 `/sources`

**Files:**
- Create: `src/sources/index.ts`, `src/multi-search.ts`
- Modify: `src/app.ts` (buildApp 시그니처에 네 번째 인자, `/search` 핸들러 앞부분 분기, `/sources` 라우트)
- Test: `test/multi-search.test.ts`

**Interfaces:**
- Produces:
  - `sources/index.ts`: `defaultSources(client: Pick<ShopbyClient,"search">): Record<SourceId, Source>`.
  - `multi-search.ts`: `parseSources(raw: string): SourceId[]`(공백 제거·빈 칸 무시·중복 제거·순서 유지, 모르는 값이나 결과 0개면 `z.ZodError` 를 던지도록 zod 스키마로), `brandText(item: Item): string`(`item.brand ? \`[${item.brand}] ${item.name}\` : item.name`), `searchSources(sources: Source[], p: SourceSearchParams, opts: { brand?: BrandRule; cache: TtlCache<SourceResult> }): Promise<MultiSearchResponse>`.
  - `MultiSearchResponse = { query: string; sort: CommonSort; page: number; size: number; brand?: string; results: Array<{ source: SourceId; ok: true; totalCount: number | null; excludedCount?: number; items: Item[] } | { source: SourceId; ok: false; error: "unsupported_sort" | "unsupported_page" | "upstream_error"; message: string }> }`.
  - `buildApp(config, client = new ShopbyClient(config), brands = loadBrands(), sources = defaultSources(client))`.
- Consumes: Tasks 2–4, `matchesBrand`, `TtlCache`.

- [ ] **Step 1: 실패 테스트** (가짜 `Source` 객체로):
  - `GET /search?q=폴로&sources=musinsa,29cm` → 200, `results.map(r=>r.source)` = `["musinsa","29cm"]`, 기본 `sort:"relevance", page:1, size:20`.
  - 한 소스가 `UpstreamError` → 그 결과만 `{ok:false, error:"upstream_error"}`, 다른 소스 `ok:true`.
  - 무신사 가짜가 `SourceError("unsupported_page")` → `error:"unsupported_page"` (Review Focus 1).
  - `sources=%20musinsa,,29cm,musinsa` → `["musinsa","29cm"]`; `sources=` 또는 `sources=nope` → 400 `invalid_request` (Review Focus 3).
  - `sources=musinsa&sort=popular` → 400 (Review Focus 4).
  - `size=101` → 400(공통 상한 100).
  - `brand=acme`: 가짜 결과 `[{brand:"에이크미", name:"맨투맨"}, {brand:null, name:"[다른브랜드] 셔츠"}]` → 첫 번째만 남고 `excludedCount:1` (brands.example.json 의 include `^\s*\[\s*(acme|에이크미)`).
  - 같은 요청 두 번 → 소스 `search` 1회; 첫 호출이 실패했으면 두 번째에 다시 호출 (Review Focus 5).
  - `GET /sources` → `[{ id:"thirtymall", label:"떠리몰", sorts:[…] }, { id:"musinsa", … }, { id:"29cm", label:"29CM", sorts:["relevance"] }]`.
  - Task 1 의 고정 테스트와 기존 `test/app.test.ts` 는 그대로 통과해야 한다(수정 금지).
- [ ] **Step 2: 실행** — FAIL.
- [ ] **Step 3: 구현** — `/search` 핸들러 첫 줄에서 `req.query.sources === undefined` 면 기존 코드 그대로 실행. 아니면 별도 zod 스키마(`q` 1~100자, `sources`, `sort` ∈ COMMON_SORTS 기본 relevance, `page` 1~500, `size` 1~100, `brand`)로 파싱 → `searchSources`. 소스 오류는 `Promise.allSettled` 로 모아 결과 항목으로, `SourceError` 면 그 code, 그 밖은 `upstream_error`. 캐시 키는 `JSON.stringify([source.id, q, sort, page, size])`, TTL 은 `config.cacheTtlMs`.
- [ ] **Step 4: 실행** — `npx vitest run && npm run typecheck` → 전부 PASS.
- [ ] **Step 5: 커밋** — `feat(api): search multiple sources via /search?sources=`

### Task 6: 이름 변경과 문서

**Files:**
- Modify: `package.json`(`name: "shop-search-api"`, `description: "떠리몰·무신사·29CM 상품 검색 API — 캐시·요청 제한·브랜드 필터, 떠리몰 새 상품 디스코드 알림"`), `package-lock.json`(`npm install --package-lock-only` 로 name 반영), `README.md`, `docs/guide.md`, `scripts/register-watch-task.ps1`(`$TaskName` 기본값 `shop-search-watch`, 머리 주석), `docs/images/brand/wordmark-light.svg`, `docs/images/brand/wordmark-dark.svg`
- `.env.example` 은 바꿀 키가 없다(새 소스는 키 불필요).

- [ ] **Step 1: README·가이드** — 제목·한 줄 소개를 `shop-search-api` 와 세 소스로, 엔드포인트 표에 `GET /search?sources=`·`GET /sources` 추가, 가이드에 다중 소스 파라미터·응답 예시·소스별 제약(무신사 1페이지, 29CM 관련도순만, 비공식 연동)·업스트림 메모 추가. 떠리몰 알림 절의 내용은 유지. 옛 레포 URL 이 나오면 새 URL 로.
- [ ] **Step 2: 워드마크** — 기존 SVG 와 같은 viewBox 높이 64, 왼쪽 주황 마크(`<rect …#EA580C>`+돋보기) 유지, 글자만 `shop-search-api` 패스로 교체. `uv run --with fonttools python <scratch 스크립트>` 로 설치된 굵은 산세리프(가능하면 `fc-list` 의 Noto Sans KR Bold/Black, 없으면 DejaVu Sans Bold)에서 패스를 뽑는다. `aria-label`·`alt` 도 새 이름. `rsvg-convert`(없으면 `uv run --with cairosvg`) 로 PNG 를 만들어 눈으로 확인. 폰트가 원본과 다르면 PR 본문에 적는다.
- [ ] **Step 3: 확인** — `grep -rn "thirtymall-search-api" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=graphify-out --exclude-dir=.git .` 결과가 docs/superpowers 아래 기록과 크론 경로 설명뿐인지 확인. `npx vitest run && npm run typecheck` PASS.
- [ ] **Step 4: 커밋** — `docs: rename to shop-search-api and document multi-source search`

### Task 7: 검증, 병합, GitHub 이름 변경

크론 시각(평일 12:30·18:30) 앞뒤 10분은 피한다.

- [ ] **Step 1: 보호 확인** — `git diff main --stat -- src/watch.ts src/discord.ts src/shopby.ts src/brands.ts` → 출력 없음.
- [ ] **Step 2: 워크트리 빌드** — 워크트리에서 `npm run build` (워크트리 `dist/` 만 만든다).
- [ ] **Step 3: 옛·새 빌드 대조** — `S=<scratchpad>`; `cp /home/young/git/thirtymall-search-api/data/seen.json $S/a.json; cp $S/a.json $S/b.json`;
  - 옛: `(cd /home/young/git/thirtymall-search-api && WATCH_STATE_FILE=$S/a.json node dist/watch.js --dry-run) > $S/old.txt`
  - 새: `(cd <worktree> && set -a && . /home/young/git/thirtymall-search-api/.env && set +a && BRANDS_FILE=/home/young/git/thirtymall-search-api/brands.json WATCH_STATE_FILE=$S/b.json node dist/watch.js --dry-run) > $S/new.txt`
  - 확인: `diff <(sed 's/^\[[^]]*\]//' $S/old.txt) <(sed 's/^\[[^]]*\]//' $S/new.txt)` 와 `diff $S/a.json $S/b.json` 둘 다 출력 없음. 원본 `seen.json` 의 `sha256sum` 이 대조 전후 같다.
- [ ] **Step 4: 실제 호출** — 워크트리에서 `PORT=3999 node dist/server.js` 를 백그라운드로 띄우고 `curl 'localhost:3999/search?q=%ED%8F%B4%EB%A1%9C&sources=thirtymall,musinsa,29cm&size=3'` → 세 소스 모두 `ok:true`, 상품 3개씩. `sources=musinsa&page=2` → `unsupported_page`. 서버 종료.
- [ ] **Step 5: 코드 리뷰** — `superpowers:requesting-code-review` 로 브랜치 전체 리뷰, 지적 반영.
- [ ] **Step 6: PR** — `git push -u origin younghwan91/multi-source`, `gh pr create`(본문에 대조 결과, 폰트 메모, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), 체크 대기, `gh pr merge --merge --delete-branch`.
- [ ] **Step 7: 이름 변경** — `gh repo rename shop-search-api --repo younghwan91/thirtymall-search-api --yes`, main 체크아웃에서 `git remote set-url origin https://github.com/younghwan91/shop-search-api.git`, `git fetch` 성공 확인. `gh repo view younghwan91/shop-search-api --json description` 으로 About 이 한국어로 새 범위를 말하는지 확인, 아니면 `gh repo edit --description`.
- [ ] **Step 8: 병합 뒤** — main 체크아웃에서 `git pull --ff-only`(소스만 갱신, **빌드 안 함**), `graphify update .`. `crontab -l | grep thirtymall-watch` 줄이 그대로인지 확인. Orca 워크트리 정리는 사용자에게 묻는다.

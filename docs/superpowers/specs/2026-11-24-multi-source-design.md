# 검색 소스 추가(무신사·29CM)와 레포 이름 변경 설계

작성일: 2026-11-24

## 왜

떠리몰 한 곳만 검색하던 API 를 국내 인기 패션 쇼핑몰까지 넓혀서, 같은 검색어(예: 폴로)를 한 API 로 여러 곳에서 찾게 한다. 떠리몰 전용이 아니게 되므로 GitHub 레포 이름을 `shop-search-api` 로 바꾼다.

## 완료 기준

- 무신사·29CM 어댑터가 가짜 응답 테스트를 통과하고, 실제 호출 한 번씩으로 응답 형식을 확인한다.
- `npm test`, `npm run typecheck` 통과.
- 기존 폴로 크론 결과가 같다: 기존 모드 고정 테스트 통과, 그리고 main 빌드와 새 빌드를 `seen.json` **복사본**으로 나란히 `--dry-run` 해서 stdout(시각 제외)과 결과 상태 파일이 같다.
- GitHub 레포 이름이 `shop-search-api`, 로컬 `origin` 이 새 주소를 가리킨다.

## 목표 / 비목표 / 반목표

- 목표: 소스 어댑터 구조, `GET /search?sources=` 다중 소스 검색, 무신사·29CM 어댑터, 레포 이름 변경.
- 비목표(사용자가 뺌): 가격 비교, 새 사이트 감시·알림, 공식 API 가 있는 사이트(네이버·eBay·쿠팡), KREAM, 옥션·G마켓.
- **반목표**: 폴로 크론(`node dist/watch.js`)의 알림·상태 파일·로그가 달라지는 것. 크론·로컬 폴더·Orca 등록·main 의 `dist/` 에 손대는 것.

## 제약

- 크론: `30 12,18 * * 1-5 cd /home/young/git/thirtymall-search-api && /usr/bin/node dist/watch.js >> data/watch.log 2>&1`. 로컬 빌드 `dist/`(gitignore), `.env`, `brands.json`, `data/seen.json` 에 기댄다.
- 매일 07:50 `pull-all` 이 `~/git/*` 의 main 을 fetch + ff-only 병합한다. 빌드는 하지 않으므로 병합해도 크론이 쓰는 `dist/` 는 그대로다.
- `--dry-run` 도 상태 파일을 저장한다. 검증은 `WATCH_STATE_FILE` 로 복사본을 가리켜서만 한다.
- 옥션·G마켓은 이 서버 접속을 403 으로 막는다. 차단 우회는 하지 않는다.
- 비공식 연동이므로 응답 캐시·요청 제한을 유지하고, 사이트 하나가 실패해도 나머지는 응답한다.

## 접근 방식

| 방식 | 판단 |
|---|---|
| **1. 소스 어댑터 + 통합 엔드포인트** | **사용자가 선택.** 사이트마다 `search()` 만 구현하고 공통 형식으로 돌려준다 |
| 2. 사이트별 엔드포인트(`/musinsa/search` …) | 쓰는 쪽이 사이트마다 다른 형식을 다뤄야 한다 |
| 3. 주기 수집 + DB | 검색만 하는 지금 범위에 무겁다 |

## 결정된 것

사용자 결정:
- 구조는 방식 1, 범위는 검색만.
- 소스: 떠리몰(기존), 무신사, 29CM.
- 새 이름 `shop-search-api`. 문제 될 일(크론·로컬 경로·Orca)은 하지 않는다.

내 판단(사용자 확인함):
- 로컬 폴더는 바꾸지 않는다. GitHub 만 바꾸고 `origin` URL 을 갱신한다(옛 주소는 GitHub 가 연결해 준다).
- main 의 `dist/` 는 다시 빌드하지 않는다. 크론은 지금 빌드로 계속 돈다.
- `scripts/register-watch-task.ps1` 의 기본 작업명은 `shop-search-watch` 로 바꾼다(사용자: 실제 알림은 심노드 크론이 보내므로 Windows 쪽은 바꿔도 된다).

## 설계

### 기존 코드는 그대로

- `src/watch.ts`, `src/discord.ts`, `src/shopby.ts`(`Product`·`toProduct`), `data/seen.json` 형식은 바꾸지 않는다.
- `GET /search?q=…` 처럼 `sources` 가 없으면 지금과 **완전히 같은 응답**(떠리몰, 기존 스키마, `brand` 포함). `/keywords/popular`, `/health` 도 그대로.
- 고정 테스트 `test/legacy-watch.test.ts`: 가짜 fetch 로 Shopby 응답을 주고 기존 모드 한 사이클의 디스코드 요청 본문, 상태 파일, 콘솔 문구를 인라인 스냅샷으로 고정한다.

### 공통 형식 (`src/sources/types.ts`)

```ts
type SourceId = "thirtymall" | "musinsa" | "29cm";
type CommonSort = "relevance" | "price_asc" | "price_desc" | "newest";
interface Item {
  source: SourceId;
  id: string;
  name: string;
  brand: string | null;
  price: number;              // 정가(원)
  discountedPrice: number;    // 판매가(원)
  discountRate: number;
  soldOut: boolean | null;
  imageUrl: string | null;
  url: string;
}
interface Source {
  id: SourceId;
  sorts: readonly CommonSort[];
  search(p: { q: string; sort: CommonSort; page: number; size: number }): Promise<{ totalCount: number | null; items: Item[] }>;
}
```

### 어댑터

| 소스 | 호출(2026-11-24 확인) | 메모 |
|---|---|---|
| thirtymall | 기존 `ShopbyClient.search` | relevance→popular |
| musinsa | `GET https://api.musinsa.com/api2/dp/v2/plp/goods?gf=A&keyword=…&sortCode=…&page=…&size=…&caller=SEARCH` | v1 은 빈 목록을 준다. 정렬 코드·가격 필드는 실제 응답으로 확정 |
| 29cm | `GET https://search-api.29cm.co.kr/api/v4/products/search?keyword=…&page=…&size=…` | `itemNo`, `itemName`, `frontBrandNameKor`, `consumerPrice`, `lastSalePrice`, `isSoldOut`, `imageUrl`(상대 경로 → 이미지 호스트 붙임). 정렬 파라미터는 실제 호출로 확정 |

지원하지 않는 정렬은 그 소스만 `unsupported_sort` 로 돌려준다.

### API

`GET /search?q=…&sources=musinsa,29cm&sort=relevance&page=1&size=20&brand=…`

```json
{ "query": "폴로", "sort": "relevance",
  "results": [
    { "source": "musinsa", "ok": true, "totalCount": 120, "items": [ /* Item */ ] },
    { "source": "29cm", "ok": false, "error": "upstream_error", "message": "…" } ] }
```

- `sources` 값은 `thirtymall`, `musinsa`, `29cm`. 모르는 값이면 400.
- 소스별 호출은 `Promise.allSettled` 로, 소스·파라미터별 결과는 기존 `TtlCache` 로 캐시한다.
- `brand` 를 주면 소스별로 받은 페이지를 `brands.json` 규칙으로 거른다. 새 소스는 상품명에 브랜드가 없는 경우가 많으므로(무신사) `[브랜드] 상품명` 으로 합친 문자열로 판정한다. 떠리몰 판정 방식은 그대로다. 여러 소스 모드에서 `brand` 는 받은 페이지만 거른다(전체 수집 안 함, 업스트림 부담 때문).
- `GET /sources`: 소스 목록과 지원 정렬.

### 레포 이름 변경

1. 같은 PR 에서 `package.json` `name`·`description`, README·`docs/guide.md`·`.env.example` 문구, 워드마크 SVG 를 새 이름으로 바꾼다(워드마크는 기존처럼 글자를 패스로 만든 SVG. 같은 폰트가 없으면 비슷한 폰트로 만들고 밝힌다).
2. PR 병합 뒤 `gh repo rename shop-search-api`, `git remote set-url origin https://github.com/younghwan91/shop-search-api.git`.
3. 크론·로컬 폴더·Orca 등록·main `dist/` 는 건드리지 않는다.

## 빌더에게 맡기는 것

파일 배치, 에러 문구, 캐시 키, 가짜 응답 내용, 무신사·29CM 정렬 코드 대응(실제 호출로 확인), 워드마크 생성 방법.

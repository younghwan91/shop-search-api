# shop-search-api 가이드

[← README로 돌아가기](../README.md)

## 목차

- [엔드포인트](#엔드포인트)
- [여러 쇼핑몰 검색](#여러-쇼핑몰-검색)
- [새 상품 알림 (디스코드)](#새-상품-알림-디스코드)
- [브랜드 필터](#브랜드-필터)
- [업스트림 메모](#업스트림-메모)

## 엔드포인트

### `GET /search`

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `q` | (필수) | 검색어, 1~100자 |
| `sort` | `popular` | `popular`, `recommend`, `price_asc`, `price_desc`, `newest`, `sales`, `reviews` |
| `page` | `1` | 1~500 |
| `size` | `20` | 1~100 |
| `brand` | (없음) | `brands.json` 의 키. 지정하면 업스트림 전체(최대 1000건)를 받아 브랜드로 걸러낸 뒤 페이지를 나눈다. 응답에 `excludedCount` 포함 |

```json
{
  "query": "라면",
  "correctedQuery": null,
  "page": 1, "size": 20, "totalCount": 42, "pageCount": 3,
  "items": [{
    "id": 137507434,
    "name": "[곤약가] 바로먹는 발효곤약라면 350g",
    "brand": "...", "seller": "...",
    "price": 4800, "discountedPrice": 990, "discountRate": 79,
    "stock": 120, "soldOut": false,
    "expirationDate": "2026-12-01",
    "registeredAt": "2026-11-19 13:51:40", "saleStartAt": "2026-11-19 00:00:00",
    "rating": 4.5, "reviewCount": 24, "salesCount": 330, "likeCount": 90,
    "promotion": "개당 약 500원대", "labels": ["소비기한"], "delivery": "무료배송",
    "imageUrl": "https://thirtymall.cdn-nhncommerce.com/....webp",
    "url": "https://thirtymall.com/detail?id=137507434"
  }]
}
```

### `GET /keywords/popular`

떠리몰 인기 검색어 (`api.thirtymall.com/keyword/popular`).

### `GET /health`

`{"ok": true}` 를 돌려준다.

## 여러 쇼핑몰 검색

`GET /search` 에 `sources` 를 주면 고른 쇼핑몰을 함께 검색한다. `sources` 가 없으면 위의 떠리몰 응답 그대로다.

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `q` | (필수) | 검색어, 1~100자 |
| `sources` | (필수) | 쉼표로 구분. `thirtymall`, `musinsa`, `29cm`. 공백·중복은 정리하고, 모르는 값이 있으면 400 |
| `sort` | `relevance` | `relevance`, `price_asc`, `price_desc`, `newest`. 떠리몰 전용 값(`popular` 등)은 400 |
| `page` | `1` | 1~500 |
| `size` | `20` | 1~100 |
| `brand` | (없음) | `brands.json` 의 키. 소스마다 받은 페이지 안에서 `[브랜드] 상품명` 으로 판정해 거른다(전체 수집은 안 한다) |

사이트별로 결과가 따로 온다. 한 곳이 실패하거나 조건을 지원하지 않으면 그 항목만 `ok: false` 다.

```json
{
  "query": "폴로", "sort": "relevance", "page": 1, "size": 20,
  "results": [
    { "source": "musinsa", "ok": true, "totalCount": 23501, "items": [{
      "source": "musinsa", "id": "7634030",
      "name": "남성 리브 니트 울 블렌드 스카프", "brand": "폴로 랄프 로렌",
      "price": 149000, "discountedPrice": 149000, "discountRate": 0, "soldOut": false,
      "imageUrl": "https://image.msscdn.net/....jpg",
      "url": "https://www.musinsa.com/products/7634030"
    }] },
    { "source": "29cm", "ok": false, "error": "upstream_error", "message": "upstream 503: ..." }
  ]
}
```

`error` 는 `upstream_error`(사이트 오류·차단), `unsupported_sort`, `unsupported_page` 중 하나다.

### 사이트별 제약

| 소스 | 정렬 | 페이지 | 전체 개수 |
|---|---|---|---|
| `thirtymall` (떠리몰) | 4가지 모두 | 1~500 | 있음 |
| `musinsa` (무신사) | 4가지 모두 | **1페이지만**(최대 100개). 2페이지부터는 앞 응답의 서명 토큰이 필요하다 | 있음 |
| `29cm` (29CM) | **`relevance` 만**. 정렬 파라미터는 결과가 불규칙하다 | 제한 없음(`limit`·`offset`) | 없음(`null`) |

### `GET /sources`

검색할 수 있는 소스와 지원 정렬, 마지막 페이지(`maxPage`, 제한 없으면 `null`)를 돌려준다.

## 새 상품 알림 (디스코드)

`npm run watch` 를 한 번 실행할 때마다 검색 결과를 `data/seen.json` 과 비교해서 처음 보는 상품을 디스코드 웹훅으로 보낸다.
무엇을 볼지는 `.env` 의 `WATCH_QUERY`(검색어)와 `WATCH_BRAND`(선택, `brands.json` 의 키)로 정한다.

1. 디스코드 채널 설정 > 연동 > 웹후크 > 새 웹후크 > URL 복사
2. `.env` 에 `DISCORD_WEBHOOK_URL`, `WATCH_QUERY`, `WATCH_BRAND` 설정 (`.env.example` 참고)
3. `npm run build && npm run watch`

- 첫 실행은 현재 상품을 기준선으로 저장만 하고 알리지 않는다
- 전송에 실패하면 상태를 저장하지 않아 다음 실행에서 다시 보낸다
- `npm run watch:dry` 는 디스코드 대신 콘솔에 출력한다
- `npm run watch:dry` 도 상태 파일을 저장한다. 운영 중인 `data/seen.json` 으로 돌리면 그 사이 새 상품이 "이미 본 것"이 되어 알림이 빠지므로, 시험할 때는 `WATCH_STATE_FILE` 로 복사본을 가리킨다
- 주기 실행은 cron 으로 건다. 예: `30 12,18 * * 1-5 cd <레포 경로> && /usr/bin/node dist/watch.js >> data/watch.log 2>&1`
- 알림은 떠리몰만 지원한다

## 브랜드 필터

상품명으로만 판별한다. 떠리몰의 brandName은 비어있거나 엉뚱한 값이 들어있는 경우가 많다. 규칙은 레포에 두지 않고
`brands.json`(`BRANDS_FILE`, gitignore 됨)에서 읽는다. `brands.example.json` 을 `brands.json` 으로 복사해 채운다.

- 패턴은 대소문자를 구분하지 않는 정규식 문자열
- 판정 순서는 `reject` → `always` → `exclude` → `include`
- `reject` 는 무조건 제외. 여성 전용·아동 전용처럼 브랜드와 무관하게 관심 없는 상품을 뺀다
- `always` 가 `exclude` 보다 우선이라, 이름이 겹치는 다른 브랜드를 빼는 규칙이 진짜 브랜드 상품을 덮지 않는다

## 업스트림 메모

- `GET https://shop-api.e-ncp.com/products/search`
  - 헤더: `clientId`(떠리몰 프론트에 들어있는 공개 키), `version: 1.0`, `platform: PC`
  - 쿼리: `filter.keywords`, `order.by`, `order.direction`, `pageNumber`, `pageSize`, `filter.totalReviewCount`
  - 잘못된 `order.by`는 400 (`NCPE0002`)
- 할인가 = `salePrice` − `immediateDiscountAmt` − `additionDiscountAmt`
- 이미지 URL은 `//`로 시작하는 프로토콜 상대 URL로 온다
- 상품 상세 페이지: `https://thirtymall.com/detail?id={productNo}`
- 무신사 `GET https://api.musinsa.com/api2/dp/v2/plp/goods`
  - 쿼리: `gf=A`, `keyword`, `sortCode`(`POPULAR`·`NEW`·`LOW_PRICE`·`HIGH_PRICE`), `page`, `size`, `caller=SEARCH`
  - v1 은 빈 목록을 준다. 2페이지 이상은 `nextPageUrl` 의 `hmacId` 없이 부르면 `meta.result: "FAIL"`(HTTP 200)
  - 할인가 `finalPrice`, 정가 `normalPrice`
- 29CM `GET https://search-api.29cm.co.kr/api/v4/products/search`
  - 쿼리: `keyword`, `limit`, `offset`. 기본 48개
  - 이미지는 `https://img.29cm.co.kr` + `imageUrl`, 상품 페이지 `https://product.29cm.co.kr/catalog/{itemNo}`
- 옥션·G마켓은 이 서버 접속을 403 으로 막고, KREAM 은 검색 결과가 화면 배치 데이터에 섞여 있어 붙이지 않았다(2026-11-24)

# thirtymall-search-api

떠리몰(https://thirtymall.com) 상품 검색 API.

떠리몰 프론트는 NHN커머스 Shopby 기반이고, 상품 검색은 브라우저가 `shop-api.e-ncp.com/products/search`를
직접 호출한다. 이 서비스는 그 엔드포인트를 감싸서 정리된 응답, 캐시, 요청 제한을 제공한다.

## 실행

```bash
npm install
npm run dev          # tsx watch, http://localhost:3000
npm test
npm run build && npm start
```

설정은 환경변수로 한다. `.env.example` 참고.

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

## 새 상품 알림 (디스코드)

`npm run watch` 를 한 번 실행할 때마다 검색 결과를 `data/seen.json` 과 비교해서 처음 보는 상품을 디스코드 웹훅으로 보낸다.
무엇을 볼지는 `.env` 의 `WATCH_QUERY`(검색어)와 `WATCH_BRAND`(선택, `brands.json` 의 키)로 정한다.

1. 디스코드 채널 설정 > 연동 > 웹후크 > 새 웹후크 > URL 복사
2. `.env` 에 `DISCORD_WEBHOOK_URL`, `WATCH_QUERY`, `WATCH_BRAND` 설정 (`.env.example` 참고)
3. `npm run build && npm run watch`

- 첫 실행은 현재 상품을 기준선으로 저장만 하고 알리지 않는다
- 전송에 실패하면 상태를 저장하지 않아 다음 실행에서 다시 보낸다
- `npm run watch:dry` 는 디스코드 대신 콘솔에 출력한다
- 주기 실행은 cron 이나 Windows 작업 스케줄러(`scripts/register-watch-task.ps1`)로 건다

## 브랜드 필터

떠리몰은 brandName이 비어있는 상품이 많아 상품명으로 판별한다. 규칙은 레포에 두지 않고
`brands.json`(`BRANDS_FILE`, gitignore 됨)에서 읽는다. 형식은 `brands.example.json` 참고.

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

## 주의

- 비공식 연동이다. 운영사가 `clientId`를 바꾸거나 API를 막으면 동작하지 않는다 (`SHOPBY_CLIENT_ID`로 교체 가능).
- 원본 서버 부담을 줄이기 위해 응답을 `CACHE_TTL_SECONDS` 동안 캐시하고 IP당 요청 수를 제한한다.
  운영에 쓰기 전에 떠리몰 이용약관을 확인할 것.

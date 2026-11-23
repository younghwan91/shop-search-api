<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/brand/wordmark-dark.svg">
  <img alt="shop-search-api" src="docs/images/brand/wordmark-light.svg" height="52">
</picture>

# shop-search-api

**떠리몰·무신사·29CM 상품 검색을 한 API로 묶은 Fastify 서비스입니다. 캐싱, 요청 제한, 브랜드 필터를 함께 제공하고, 떠리몰 새 상품은 디스코드로 알려 줍니다.**

사이트마다 다른 검색 응답을 같은 JSON 형식으로 맞춰서, 같은 검색어를 여러 쇼핑몰에서 한 번에 찾을 수 있습니다.

![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[가이드](docs/guide.md) · [엔드포인트](docs/guide.md#엔드포인트) · [여러 쇼핑몰 검색](docs/guide.md#여러-쇼핑몰-검색) · [디스코드 알림](docs/guide.md#새-상품-알림-디스코드) · [브랜드 필터](docs/guide.md#브랜드-필터)

</div>

## 빠른 시작

Node.js 22 이상이 필요합니다.

```bash
npm install
npm run dev          # tsx watch, http://localhost:3000
npm test
npm run build && npm start
```

설정은 환경변수로 합니다. 키와 기본값은 `.env.example`에 있으며, 서버(`npm run dev`·`npm start`)는 `.env`를 읽지 않으므로 환경변수로 넘기고 `npm run watch`는 `.env`를 읽습니다.

## 핵심 기능

- **여러 쇼핑몰 검색**: `GET /search?sources=thirtymall,musinsa,29cm` 한 번으로 세 곳을 검색하고, 사이트별 결과를 같은 상품 형식으로 돌려줍니다. 한 곳이 실패해도 나머지 결과는 그대로 옵니다.
- **정규화된 떠리몰 검색**: 할인가 계산, 소비기한, 프로모션 라벨, 재고 상태를 일관된 JSON 스키마로 정리합니다(`GET /search`, `GET /keywords/popular`).
- **캐시와 요청 제한**: `CACHE_TTL_SECONDS` 기반 응답 캐싱과 IP당 요청 제한으로 업스트림 부하를 줄입니다.
- **4단계 브랜드 필터**: `brands.json`의 `reject` → `always` → `exclude` → `include` 정규식 규칙으로 상품명 기반 정밀 필터링을 적용합니다.
- **디스코드 새 상품 알림**: `npm run watch`가 `data/seen.json`과 비교해 처음 보는 상품만 웹훅으로 전송합니다(전송 실패 시 다음 실행에서 재전송).

## 엔드포인트

| 메서드·경로 | 설명 | 상세 |
|---|---|---|
| `GET /search` | 떠리몰 검색어·정렬·페이지·브랜드 필터 기반 상품 검색 | [파라미터·응답 예시](docs/guide.md#get-search) |
| `GET /search?sources=…` | 떠리몰·무신사·29CM 중 고른 곳을 함께 검색 | [상세](docs/guide.md#여러-쇼핑몰-검색) |
| `GET /sources` | 검색할 수 있는 쇼핑몰과 지원 정렬 | [상세](docs/guide.md#get-sources) |
| `GET /keywords/popular` | 떠리몰 인기 검색어 조회 | [상세](docs/guide.md#get-keywordspopular) |
| `GET /health` | 헬스 체크(`{"ok": true}` 반환) | [상세](docs/guide.md#get-health) |

## 주의

- 모두 비공식 연동입니다. 사이트가 API를 바꾸거나 막으면 그 사이트만 동작하지 않습니다(떠리몰 `clientId`는 `SHOPBY_CLIENT_ID`로 교체 가능).
- 원본 서버 부담을 줄이기 위해 응답을 `CACHE_TTL_SECONDS` 동안 캐시하고 IP당 요청 수를 제한합니다. 운영 환경에 쓰기 전에 각 쇼핑몰 이용약관을 확인해 주세요.

## 문서

| 문서 | 내용 |
|---|---|
| [가이드](docs/guide.md) | 엔드포인트 스키마, 여러 쇼핑몰 검색, 디스코드 알림 설정, 브랜드 필터 규칙, 업스트림 메모 |
| [`.env.example`](.env.example) | 환경변수 키와 기본값 |
| [`brands.example.json`](brands.example.json) | 브랜드 필터 설정 예시 |

## 라이선스

MIT — [LICENSE](LICENSE) 참고.

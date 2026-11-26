import { describe, expect, it, vi } from "vitest";
import { DISCORD_LIMITS, embedProblems, notifyDiscord, productEmbed } from "../src/discord.js";
import { toProduct } from "../src/shopby.js";
import { shopbyProduct } from "./fixtures.js";

// 2026-11-24 운영에서 디스코드가 400 {"embeds":["0"]} 로 거부한 실제 상품(136639454).
// 이미지 파일 이름에 인코딩 안 된 공백·한글이 들어 있다.
const brokeProd = shopbyProduct({
  productNo: 136639454,
  productName: "[프리미엄세컨핸드] XL사이즈_폴로 랄프로렌 스웨터 (떠리무료배송)",
  salePrice: 224000,
  immediateDiscountAmt: 174000,
  stockCnt: 1,
  registerYmdt: "2026-09-02 11:11:49",
  listImageUrlInfo: {
    url: "//thirtymall.cdn-nhncommerce.com/20261117/193710.908341620/제목을 입력해주세요. - 2026-11-16T133932.258_136639454_293143.webp",
  },
});

const edgeCases = {
  "인코딩 안 된 공백·한글 이미지 URL": brokeProd,
  "평범한 상품": shopbyProduct(),
  "긴 상품명": shopbyProduct({ productName: "가".repeat(400) }),
  "빈 상품명": shopbyProduct({ productName: "  " }),
  "이미지·등록일 없음": shopbyProduct({ listImageUrlInfo: null, imageUrls: null, registerYmdt: "" }),
  "이상한 이미지 URL": shopbyProduct({ listImageUrlInfo: { url: "javascript:alert(1)" } }),
  품절: shopbyProduct({ stockCnt: 0, saleStatusType: "SOLDOUT" }),
};

describe("productEmbed", () => {
  for (const [name, raw] of Object.entries(edgeCases)) {
    it(`${name}: 디스코드 embed 한도를 지킨다`, () => {
      expect(embedProblems([productEmbed(toProduct(raw))])).toEqual([]);
    });
  }

  it("이미지 URL의 공백·한글을 퍼센트 인코딩한다", () => {
    const e = productEmbed(toProduct(brokeProd));
    expect(e.thumbnail?.url).toBe(
      "https://thirtymall.cdn-nhncommerce.com/20261117/193710.908341620/%EC%A0%9C%EB%AA%A9%EC%9D%84%20%EC%9E%85%EB%A0%A5%ED%95%B4%EC%A3%BC%EC%84%B8%EC%9A%94.%20-%202026-11-16T133932.258_136639454_293143.webp",
    );
  });

  it("검사기는 고치기 전 embed(인코딩 안 된 썸네일)를 잡아낸다", () => {
    const e = productEmbed(toProduct(brokeProd));
    const raw = brokeProd.listImageUrlInfo!.url;
    expect(embedProblems([{ ...e, thumbnail: { url: `https:${raw}` } }])).toHaveLength(1);
    expect(embedProblems([{ ...e, title: "" }])).toHaveLength(1);
    expect(embedProblems([{ ...e, fields: [{ name: "a", value: "" }] }])).toHaveLength(1);
  });
});

describe("notifyDiscord", () => {
  it("상품 23개를 10개씩 나눠 보내고, 메시지마다 한도를 지킨다", async () => {
    const products = Array.from({ length: 23 }, (_, i) =>
      toProduct({ ...brokeProd, productNo: i + 1, productName: "나".repeat(300) }),
    );
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await notifyDiscord("https://discord.test/hook", "🆕 새 상품 23개", products, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchImpl.mock.calls as unknown as [string, RequestInit][]) {
      const body = JSON.parse(init.body as string);
      expect(body.embeds.length).toBeLessThanOrEqual(DISCORD_LIMITS.embedsPerMessage);
      expect(embedProblems(body.embeds, body.content)).toEqual([]);
    }
  });
});

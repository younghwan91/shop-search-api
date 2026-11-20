import type { ShopbyProduct } from "../src/shopby.js";

export function shopbyProduct(overrides: Partial<ShopbyProduct> = {}): ShopbyProduct {
  return {
    productNo: 138032171,
    productName: "누들컬 단백질 컵라면 99g*16개입",
    brandName: "#2.MD추천",
    partnerName: "버터플라이어 주식회사",
    salePrice: 50400,
    immediateDiscountAmt: 42410,
    immediateDiscountUnitType: "WON",
    additionDiscountAmt: 0,
    additionDiscountUnitType: "WON",
    stockCnt: 459,
    saleStatusType: "ONSALE",
    expirationDate: "2026-12-01",
    registerYmdt: "2026-11-16 09:57:05",
    saleStartYmdt: "2026-11-16 00:00:00",
    reviewRating: 4.5,
    totalReviewCount: 24,
    saleCnt: 330,
    likeCount: 90,
    promotionText: "개당 약 500원대",
    stickerLabels: ["소비기한", "매입무료배송"],
    deliveryConditionInfo: { summary: "무료배송" },
    listImageUrlInfo: { url: "//thirtymall.cdn-nhncommerce.com/a.webp" },
    imageUrls: ["//thirtymall.cdn-nhncommerce.com/a.webp"],
    ...overrides,
  };
}

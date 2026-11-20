import { readFileSync } from "node:fs";
import type { Product } from "./shopby.js";

/**
 * 브랜드는 상품명으로만 판별한다. 떠리몰의 brandName은 비어있거나 "#2.MD추천" 같은 운영용 값이 많고,
 * 판매자가 다른 브랜드 상품에 엉뚱한 brandName을 넣어둔 경우도 있다.
 *
 * 판정 순서: reject → always → exclude → include
 * - reject: 무조건 제외. 여성 전용·아동 전용처럼 브랜드와 상관없이 관심 없는 상품을 뺀다.
 * - always: 확실한 브랜드 표기. exclude보다 우선이라 제외 규칙이 실수로 덮지 못한다.
 * - exclude: 이름만 겹치는 다른 브랜드
 * - include: 브랜드 머리표처럼 정황상 확실한 표기
 *
 * 규칙은 레포에 두지 않고 brands.json(BRANDS_FILE)에서 읽는다. 형식은 brands.example.json 참고.
 * 패턴은 대소문자를 구분하지 않는 정규식 문자열이다.
 */
export interface BrandRuleConfig {
  label: string;
  reject?: string[];
  always?: string[];
  exclude?: string[];
  include?: string[];
}

export interface BrandRule {
  label: string;
  reject: RegExp[];
  always: RegExp[];
  exclude: RegExp[];
  include: RegExp[];
}

export type Brands = Record<string, BrandRule>;

export function compileBrands(raw: Record<string, BrandRuleConfig>): Brands {
  const compile = (patterns: string[] = []) => patterns.map((p) => new RegExp(p, "i"));
  return Object.fromEntries(
    Object.entries(raw).map(([key, r]) => [
      key,
      {
        label: r.label,
        reject: compile(r.reject),
        always: compile(r.always),
        exclude: compile(r.exclude),
        include: compile(r.include),
      },
    ]),
  );
}

export function loadBrands(file = process.env.BRANDS_FILE ?? "brands.json"): Brands {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  return compileBrands(JSON.parse(text) as Record<string, BrandRuleConfig>);
}

export function matchesBrand(product: Pick<Product, "name">, rule: BrandRule): boolean {
  const hit = (res: RegExp[]) => res.some((re) => re.test(product.name));
  if (hit(rule.reject)) return false;
  if (hit(rule.always)) return true;
  if (hit(rule.exclude)) return false;
  return hit(rule.include);
}

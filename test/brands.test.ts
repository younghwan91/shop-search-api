import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileBrands, loadBrands, matchesBrand } from "../src/brands.js";
import example from "../brands.example.json" with { type: "json" };

const { acme } = compileBrands(example);

describe("matchesBrand", () => {
  it.each([
    ["[ACME] 에이크미 맨투맨", null],
    ["[에이크미] 볼캡", null],
    ["에이크미 여성 가디건", null],
    ["무지 셔츠", "에이크미"],
    // 제외 규칙과 겹쳐도 always 표기가 있으면 남아야 한다
    ["에이크미 정품 x 에이크미클럽 콜라보", null],
    // 남녀 모두 해당하거나 성인용이 섞여 있으면 reject 대상이 아니다
    ["[에이크미] 남녀공용 여성 사이즈 포함 맨투맨", null],
    ["[에이크미] 남성/여성용 니트", null],
    ["[에이크미] 성인/유아동 후드티", null],
  ])("남긴다: %s", (name, brand) => {
    expect(matchesBrand({ name, brand }, acme)).toBe(true);
  });

  it.each([
    ["[에이크미클럽] 부츠", "에이크미클럽"],
    ["[ACME CLUB] 로퍼", null],
    // 이름에 브랜드명이 있어도 머리표가 아니면 다른 브랜드 상품으로 본다
    ["[다른브랜드] 에이크미 스타일 셔츠", null],
    ["카라넥 반팔 티셔츠", null],
    // reject는 always보다 우선
    ["[에이크미] 여성 가디건", null],
    ["에이크미 정품 여성 니트", null],
    ["[ACME] Women's Shirt", null],
    ["[에이크미] 아동 패딩", null],
    ["[에이크미] 키즈 볼캡", null],
    ["[ACME] Baby Romper", null],
  ])("뺀다: %s", (name, brand) => {
    expect(matchesBrand({ name, brand }, acme)).toBe(false);
  });
});

describe("loadBrands", () => {
  it("파일이 없으면 빈 규칙", () => {
    expect(loadBrands(join(tmpdir(), "no-such-brands.json"))).toEqual({});
  });

  it("JSON 파일을 읽어 정규식으로 컴파일한다", async () => {
    const file = join(await mkdtemp(join(tmpdir(), "brands-")), "brands.json");
    await writeFile(file, JSON.stringify({ x: { label: "X", include: ["^x"] } }));
    const brands = loadBrands(file);
    expect(brands.x.label).toBe("X");
    expect(matchesBrand({ name: "X 셔츠", brand: null }, brands.x)).toBe(true);
  });
});

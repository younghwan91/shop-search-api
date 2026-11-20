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
  ])("남긴다: %s", (name, brand) => {
    expect(matchesBrand({ name, brand }, acme)).toBe(true);
  });

  it.each([
    ["[에이크미클럽] 부츠", "에이크미클럽"],
    ["[ACME CLUB] 로퍼", null],
    // 이름에 브랜드명이 있어도 머리표가 아니면 다른 브랜드 상품으로 본다
    ["[다른브랜드] 에이크미 스타일 셔츠", null],
    ["카라넥 반팔 티셔츠", null],
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

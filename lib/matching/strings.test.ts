import { describe, expect, it } from "vitest";
import {
  jaro,
  jaroWinkler,
  normalize,
  normalizedStringSimilarity,
  pairwiseMax,
} from "./strings";

describe("jaro / jaroWinkler", () => {
  it("returns 1 for identical strings", () => {
    expect(jaro("abc", "abc")).toBe(1);
    expect(jaroWinkler("abc", "abc")).toBe(1);
  });

  it("returns 0 when one string is empty", () => {
    expect(jaro("", "abc")).toBe(0);
    expect(jaroWinkler("abc", "")).toBe(0);
  });

  it("matches the classic martha/marhta Jaro–Winkler value", () => {
    expect(jaro("martha", "marhta")).toBeCloseTo(0.944, 2);
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
  });

  it("rewards a common prefix above the boost threshold", () => {
    expect(jaroWinkler("dwayne", "duane")).toBeGreaterThan(
      jaro("dwayne", "duane"),
    );
  });
});

describe("normalize", () => {
  it("lowercases, strips diacritics, and collapses whitespace", () => {
    expect(normalize("  Béyoncé   Knowles ")).toBe("beyonce knowles");
  });
});

describe("normalizedStringSimilarity", () => {
  it("is case- and diacritic-insensitive", () => {
    expect(normalizedStringSimilarity("Beyoncé", "beyonce")).toBe(1);
  });
});

describe("pairwiseMax", () => {
  it("returns the best cross-pair similarity", () => {
    expect(
      pairwiseMax(["Drake", "Future"], ["future", "metro"]),
    ).toBeCloseTo(1, 5);
  });

  it("returns 0 when either list is empty", () => {
    expect(pairwiseMax([], ["x"])).toBe(0);
    expect(pairwiseMax(["x"], [])).toBe(0);
  });
});

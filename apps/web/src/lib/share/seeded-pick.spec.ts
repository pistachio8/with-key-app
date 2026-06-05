// src/lib/share/seeded-pick.spec.ts
import { describe, it, expect } from "vitest";
import { pickOne, sample } from "./seeded-pick";

describe("pickOne", () => {
  it("빈 배열이면 null", () => {
    expect(pickOne([], 1)).toBeNull();
  });
  it("같은 seed면 같은 결과(결정적)", () => {
    const arr = ["a", "b", "c", "d", "e"];
    expect(pickOne(arr, 42)).toBe(pickOne(arr, 42));
  });
  it("seed가 다르면 (대개) 다른 결과", () => {
    const arr = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const results = new Set([1, 2, 3, 4, 5].map((s) => pickOne(arr, s)));
    expect(results.size).toBeGreaterThan(1);
  });
  it("항상 배열 원소를 반환", () => {
    const arr = ["a", "b", "c"];
    for (let s = 0; s < 20; s += 1) expect(arr).toContain(pickOne(arr, s));
  });
});

describe("sample", () => {
  it("n개를 반환(배열보다 작을 때)", () => {
    expect(sample(["a", "b", "c", "d", "e"], 3, 7)).toHaveLength(3);
  });
  it("배열보다 n이 크면 전체 길이", () => {
    expect(sample(["a", "b"], 6, 7)).toHaveLength(2);
  });
  it("같은 seed면 같은 순서(결정적)", () => {
    const arr = ["a", "b", "c", "d", "e", "f"];
    expect(sample(arr, 4, 99)).toEqual(sample(arr, 4, 99));
  });
  it("원본을 변형하지 않음(불변)", () => {
    const arr = ["a", "b", "c"];
    sample(arr, 2, 5);
    expect(arr).toEqual(["a", "b", "c"]);
  });
  it("반환 원소는 모두 원본에 존재", () => {
    const arr = ["a", "b", "c", "d"];
    for (const x of sample(arr, 3, 11)) expect(arr).toContain(x);
  });
});

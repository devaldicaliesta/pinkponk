import { describe, expect, it } from "vitest";
import { gradeTiming, rallySpeedFactor } from "./timing";

describe("penilaian timing", () => {
  it.each([
    [0, "perfect"],
    [50, "perfect"],
    [-50, "perfect"],
    [51, "great"],
    [-100, "great"],
    [101, "good"],
    [-160, "good"],
    [-161, "early"],
    [200, "late"],
    [250, "late"],
    [-250, "early"],
    [251, "miss"],
    [-400, "miss"],
  ])("selisih %i ms → %s", (delta, grade) => {
    expect(gradeTiming(delta)).toBe(grade);
  });

  it("tanpa tap = miss", () => {
    expect(gradeTiming(null)).toBe("miss");
  });

  it("kecepatan reli naik 3% per pukulan, maksimal 35%", () => {
    expect(rallySpeedFactor(0)).toBe(1);
    expect(rallySpeedFactor(5)).toBeCloseTo(1.1);
    expect(rallySpeedFactor(100)).toBeCloseTo(1.25);
  });

  it("jendela timing bisa dilebarkan atau disempitkan (kemampuan Gamble)", () => {
    expect(gradeTiming(120)).toBe("good");
    expect(gradeTiming(120, 1.5)).toBe("great");
    expect(gradeTiming(60, 0.65)).toBe("great");
    expect(gradeTiming(300, 1.5)).toBe("late");
    expect(gradeTiming(300)).toBe("miss");
  });
});

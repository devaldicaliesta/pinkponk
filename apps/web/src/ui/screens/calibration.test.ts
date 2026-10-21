import { describe, expect, it } from "vitest";
import { calibrationOffset } from "./Calibration";

describe("kalibrasi latensi", () => {
  const beats = [0, 600, 1200, 1800, 2400, 3000];

  it("rata-rata keterlambatan tap", () => {
    expect(calibrationOffset(beats, [40, 650, 1230, 1850, 2440])).toBe(42);
  });

  it("dibatasi ±150 ms dan butuh minimal 4 tap", () => {
    expect(calibrationOffset(beats, [200, 800, 1400, 2000])).toBe(150);
    expect(calibrationOffset(beats, [10, 610])).toBeNull();
  });

  it("tap yang jauh dari ketukan diabaikan", () => {
    expect(calibrationOffset(beats, [0, 600, 1200, 1800, 2700])).toBe(0);
  });
});

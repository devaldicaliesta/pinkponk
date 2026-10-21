import { describe, expect, it } from "vitest";
import { readSwing, screenToBatX, tapAim } from "./swing";

describe("pemetaan ayunan", () => {
  it("tengah layar = bat di tengah meja", () => {
    expect(screenToBatX(0.5)).toBe(0);
    expect(screenToBatX(0)).toBe(-1);
    expect(screenToBatX(1)).toBe(1);
  });

  it("pointer diam = pukulan blok", () => {
    const r = readSwing([{ t: 0, x: 0.5, y: 0.5 }], 10, false);
    expect(r.power).toBeLessThan(0.3);
    expect(r.aim).toBe(0);
  });

  it("ayunan cepat ke kanan atas = keras, ke kanan, topspin", () => {
    const r = readSwing(
      [
        { t: 0, x: 0.3, y: 0.6 },
        { t: 100, x: 0.6, y: 0.45 },
      ],
      100,
      false,
    );
    expect(r.aim).toBeGreaterThan(0.9);
    expect(r.lift).toBeGreaterThan(0.9);
    expect(r.power).toBeGreaterThan(0.9);
  });

  it("sampel lama diabaikan", () => {
    const r = readSwing(
      [
        { t: 0, x: 0, y: 0 },
        { t: 50, x: 1, y: 0 },
      ],
      1000,
      false,
    );
    expect(r.power).toBeLessThan(0.3);
  });

  it("tap di sisi kiri/kanan mengarahkan bola", () => {
    expect(tapAim(0.05)).toBeLessThan(-0.9);
    expect(tapAim(0.5)).toBe(0);
    expect(tapAim(0.95)).toBeGreaterThan(0.9);
  });
});

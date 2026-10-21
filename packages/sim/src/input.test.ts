import { describe, expect, it } from "vitest";
import { MS_PER_TICK } from "./constants";
import { sanitizeInput } from "./input";
import { emptyInput } from "./types";

describe("sanitizeInput", () => {
  it("membatasi nilai ke rentang sah", () => {
    const out = sanitizeInput({ ...emptyInput(10), x: 99, aim: -5, lift: 3, power: 9 }, 10);
    expect(out).toMatchObject({ x: 1.1, aim: -1, lift: 1, power: 1 });
  });

  it("menolak nilai bukan angka", () => {
    const out = sanitizeInput({ ...emptyInput(10), x: Number.NaN, power: Infinity }, 10);
    expect(out.x).toBe(0);
    expect(out.power).toBe(0);
  });

  it("tick tampilan tidak boleh di masa depan", () => {
    expect(sanitizeInput(emptyInput(500), 100).viewTick).toBe(100);
  });

  it("menolak tap di masa depan atau terlalu lama", () => {
    const now = 1000;
    const nowMs = now * MS_PER_TICK;
    expect(sanitizeInput({ ...emptyInput(now), tapMs: nowMs + 100 }, now).tapMs).toBeNull();
    expect(sanitizeInput({ ...emptyInput(now), tapMs: nowMs - 2000 }, now).tapMs).toBeNull();
    expect(sanitizeInput({ ...emptyInput(now), tapMs: nowMs - 100 }, now).tapMs).toBe(nowMs - 100);
  });
});

import { describe, expect, it } from "vitest";
import { type Ball, stepBall } from "./ball";
import { NET_H, TABLE_HALF_L } from "./constants";
import { solveServe, solveShot, spinFor } from "./solver";
import { vec } from "./vec";

const dropOnTable = (spinX: number): Ball => ({
  pos: vec(0, 0.3, 0.5),
  vel: vec(0, -2, -6),
  spin: vec(spinX, 0, 0),
});

const bounceSpeed = (b: Ball) => {
  for (let i = 0; i < 200; i++) if (stepBall(b)?.kind === "table") return -b.vel.z;
  throw new Error("tidak memantul");
};

describe("fisika bola", () => {
  it("topspin keluar lebih cepat dari backspin setelah memantul", () => {
    const top = spinFor(-1, 1, 0).x;
    expect(bounceSpeed(dropOnTable(top))).toBeGreaterThan(bounceSpeed(dropOnTable(-top)));
  });

  it("bola rendah menabrak net dan kembali ke sisi asal", () => {
    const b: Ball = { pos: vec(0, NET_H * 0.5, 0.2), vel: vec(0, 0, -5), spin: vec() };
    let net = false;
    for (let i = 0; i < 30; i++) if (stepBall(b)?.kind === "net") net = true;
    expect(net).toBe(true);
    expect(b.pos.z).toBeGreaterThan(0);
  });

  it("bola di luar meja jatuh ke lantai", () => {
    const b: Ball = { pos: vec(0, 0.3, TABLE_HALF_L + 0.5), vel: vec(), spin: vec() };
    let floor = false;
    for (let i = 0; i < 200 && !floor; i++) floor = stepBall(b)?.kind === "floor";
    expect(floor).toBe(true);
  });
});

describe("solver", () => {
  it.each([
    [0.3, 10, 0.3],
    [0.3, 18, 0.7],
    [0.1, 6, 0],
    [0.5, 15, -0.5],
    [0.05, 13, 0.4],
  ])("pukulan dari tinggi %f m kecepatan %f mendarat di meja lawan", (y, speed, top) => {
    const s = solveShot(vec(0.2, y, 1.6), { targetX: 0.3, targetZ: -1, speed, top, side: 0.2 });
    expect(s.valid).toBe(true);
    expect(s.landZ).toBeLessThan(0);
    expect(Math.abs(s.landX - 0.3)).toBeLessThan(0.1);
  });

  it.each([
    [1.49, 0],
    [1.49, 0.3],
    [-1.49, -0.3],
    [-1.49, 1],
  ])("servis dari z=%f dengan spin %f selalu sah", (z, top) => {
    for (const aim of [-0.8, 0, 0.8]) {
      for (const power of [0, 0.5, 1]) {
        expect(solveServe(vec(0, 0.23, z), aim, power, top).valid).toBe(true);
      }
    }
  });
});

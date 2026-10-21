import { type Ball, copyBall, type Side, sideOfZ, stepBall } from "./ball";
import { HIT_PLANE_Z, LOW_HIT_Y } from "./constants";

/** Apakah posisi bola sudah di titik pukul pemain `p` (setelah memantul di sisinya). */
export const atHitPoint = (b: Ball, p: Side): boolean => {
  const towardP = p === 0 ? b.vel.z > 0 : b.vel.z < 0;
  const pastPlane = p === 0 ? b.pos.z >= HIT_PLANE_Z : b.pos.z <= -HIT_PLANE_Z;
  if (pastPlane && towardP) return true;
  // Bola pendek: dipukul saat sudah turun rendah di sisi pemain.
  return b.vel.y < 0 && b.pos.y < LOW_HIT_Y && sideOfZ(b.pos.z) === p && Math.abs(b.pos.z) > 0.25;
};

export interface Crossing {
  ticks: number;
  x: number;
  y: number;
  z: number;
}

/**
 * Perkirakan kapan dan di mana bola mencapai titik pukul `p`.
 * `bounced` = bola sudah memantul di sisi `p`. Mengembalikan null bila bola
 * tidak akan sampai (misalnya jatuh di sisi lain).
 */
export const predictCrossing = (
  ball: Ball,
  p: Side,
  bounced: boolean,
  maxTicks = 300,
): Crossing | null => {
  const b = copyBall(ball);
  let hasBounced = bounced;
  for (let i = 1; i <= maxTicks; i++) {
    const c = stepBall(b);
    if (c?.kind === "table") {
      if (hasBounced) return null;
      // Pantulan di sisi lain hanya terjadi saat servis (pantul pertama di sisi server).
      if (c.side === p) hasBounced = true;
    } else if (c?.kind === "floor") {
      return null;
    }
    if (hasBounced && atHitPoint(b, p)) return { ticks: i, x: b.pos.x, y: b.pos.y, z: b.pos.z };
  }
  return null;
};

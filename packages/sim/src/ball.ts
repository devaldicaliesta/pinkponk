import {
  BALL_R,
  DRAG_K,
  DT,
  FLOOR_Y,
  GRAVITY,
  MAGNUS_K,
  NET_H,
  NET_HALF_W,
  SPIN_DECAY_PER_TICK,
  TABLE_FRICTION,
  TABLE_HALF_L,
  TABLE_HALF_W,
  TABLE_RESTITUTION,
} from "./constants";
import { copyVec, cross, lengthOf, type Vec3 } from "./vec";

export interface Ball {
  pos: Vec3;
  vel: Vec3;
  spin: Vec3;
}

export type Side = 0 | 1;

export type BallContact =
  | { kind: "table"; side: Side; x: number; z: number }
  | { kind: "net" }
  | { kind: "floor" };

export const copyBall = (b: Ball): Ball => ({
  pos: copyVec(b.pos),
  vel: copyVec(b.vel),
  spin: copyVec(b.spin),
});

export const sideOfZ = (z: number): Side => (z >= 0 ? 0 : 1);

export const isOverTable = (x: number, z: number): boolean =>
  Math.abs(x) <= TABLE_HALF_W && Math.abs(z) <= TABLE_HALF_L;

const applyForces = (b: Ball): void => {
  const speed = lengthOf(b.vel);
  const magnus = cross(b.spin, b.vel);
  b.vel.x += (-DRAG_K * speed * b.vel.x + MAGNUS_K * magnus.x) * DT;
  b.vel.y += (-GRAVITY - DRAG_K * speed * b.vel.y + MAGNUS_K * magnus.y) * DT;
  b.vel.z += (-DRAG_K * speed * b.vel.z + MAGNUS_K * magnus.z) * DT;
};

// Gesekan saat kontak dengan meja: mengurangi slip titik kontak dan memindahkan
// sebagian energi antara kecepatan dan spin (model bola berongga, I = 2/3 m r²).
const applyTableFriction = (b: Ball): void => {
  // Kecepatan titik kontak = v + ω × (0, -r, 0).
  const slipX = b.vel.x + b.spin.z * BALL_R;
  const slipZ = b.vel.z - b.spin.x * BALL_R;
  b.vel.x -= TABLE_FRICTION * slipX;
  b.vel.z -= TABLE_FRICTION * slipZ;
  const k = (TABLE_FRICTION * 3) / (2 * BALL_R);
  b.spin.x += k * slipZ;
  b.spin.z -= k * slipX;
};

const collideNet = (b: Ball, prevZ: number): boolean => {
  const crossed = (prevZ > 0 && b.pos.z <= 0) || (prevZ < 0 && b.pos.z >= 0);
  if (!crossed || Math.abs(b.pos.x) > NET_HALF_W) return false;
  if (b.pos.y > NET_H + BALL_R || b.pos.y < 0) return false;
  if (b.pos.y < NET_H - BALL_R * 0.5) {
    // Menabrak badan net: bola memantul lemah ke sisi asal.
    b.vel.z = -b.vel.z * 0.15;
    b.vel.y *= 0.3;
    b.pos.z = prevZ > 0 ? BALL_R : -BALL_R;
  } else {
    // Menyentuh pita net: bola melambat dan sedikit terangkat.
    b.vel.z *= 0.55;
    b.vel.y = Math.abs(b.vel.y) * 0.5 + 0.3;
  }
  b.spin.x *= 0.5;
  b.spin.y *= 0.5;
  b.spin.z *= 0.5;
  return true;
};

// Satu langkah fisika. Mengembalikan kontak yang terjadi di langkah ini.
export const stepBall = (b: Ball): BallContact | null => {
  const prevZ = b.pos.z;
  const prevY = b.pos.y;
  applyForces(b);
  b.pos.x += b.vel.x * DT;
  b.pos.y += b.vel.y * DT;
  b.pos.z += b.vel.z * DT;
  b.spin.x *= SPIN_DECAY_PER_TICK;
  b.spin.y *= SPIN_DECAY_PER_TICK;
  b.spin.z *= SPIN_DECAY_PER_TICK;

  if (collideNet(b, prevZ)) return { kind: "net" };

  if (b.vel.y < 0 && b.pos.y <= BALL_R && prevY > BALL_R && isOverTable(b.pos.x, b.pos.z)) {
    b.pos.y = BALL_R;
    b.vel.y = -b.vel.y * TABLE_RESTITUTION;
    applyTableFriction(b);
    return { kind: "table", side: sideOfZ(b.pos.z), x: b.pos.x, z: b.pos.z };
  }

  if (b.pos.y <= FLOOR_Y + BALL_R) {
    b.pos.y = FLOOR_Y + BALL_R;
    b.vel.y = Math.abs(b.vel.y) * 0.6;
    b.vel.x *= 0.7;
    b.vel.z *= 0.7;
    return { kind: "floor" };
  }
  return null;
};

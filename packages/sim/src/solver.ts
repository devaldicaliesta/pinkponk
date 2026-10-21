import { type Ball, isOverTable, stepBall } from "./ball";
import { BALL_R, MAX_SPIN, TABLE_HALF_L, TABLE_HALF_W } from "./constants";
import { copyVec, type Vec3, vec } from "./vec";

export interface ShotSpec {
  targetX: number;
  targetZ: number;
  /** Kecepatan horizontal awal (m/s). */
  speed: number;
  /** -1 backspin … 1 topspin. */
  top: number;
  /** -1 … 1, putaran samping. */
  side: number;
}

export interface Launch {
  vel: Vec3;
  spin: Vec3;
}

interface Flight {
  landX: number;
  landZ: number;
  netHit: boolean;
  onTable: boolean;
}

const MAX_FLIGHT_STEPS = 360;

export const spinFor = (dirZ: number, top: number, side: number): Vec3 =>
  vec(dirZ * top * MAX_SPIN, side * MAX_SPIN * 0.6, 0);

// Terbangkan bola sampai turun melewati bidang meja, lalu catat titik jatuhnya.
const fly = (pos: Vec3, launch: Launch): Flight => {
  const b: Ball = { pos: copyVec(pos), vel: copyVec(launch.vel), spin: copyVec(launch.spin) };
  let netHit = false;
  for (let i = 0; i < MAX_FLIGHT_STEPS; i++) {
    const prevY = b.pos.y;
    const contact = stepBall(b);
    if (contact?.kind === "net") netHit = true;
    if (contact?.kind === "table")
      return { landX: contact.x, landZ: contact.z, netHit, onTable: true };
    if (b.vel.y < 0 && prevY > BALL_R && b.pos.y <= BALL_R) {
      return { landX: b.pos.x, landZ: b.pos.z, netHit, onTable: false };
    }
    if (contact?.kind === "floor") break;
  }
  return { landX: b.pos.x, landZ: b.pos.z, netHit, onTable: false };
};

const launchToward = (pos: Vec3, tx: number, tz: number, speed: number, vy: number, spin: Vec3) => {
  const dx = tx - pos.x;
  const dz = tz - pos.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  return { vel: vec((dx / len) * speed, vy, (dz / len) * speed), spin };
};

// Cari vy agar bola jatuh sejauh sasaran. Jarak jatuh naik seiring vy, kecuali
// bola menabrak net (dianggap terlalu pendek).
const solveVy = (pos: Vec3, tx: number, tz: number, speed: number, spin: Vec3): Launch => {
  const want = Math.abs(tz - pos.z);
  let lo = -5;
  let hi = 7;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const f = fly(pos, launchToward(pos, tx, tz, speed, mid, spin));
    const dist = Math.abs(f.landZ - pos.z);
    if (f.netHit || dist < want) lo = mid;
    else hi = mid;
  }
  return launchToward(pos, tx, tz, speed, hi, spin);
};

export interface SolvedShot extends Launch {
  landX: number;
  landZ: number;
  valid: boolean;
}

/** Hitung peluncuran bola dari `pos` agar mendarat di sasaran tanpa menyangkut net. */
export const solveShot = (pos: Vec3, spec: ShotSpec): SolvedShot => {
  const dirZ = spec.targetZ < pos.z ? -1 : 1;
  const spin = spinFor(dirZ, spec.top, spec.side);
  let speed = spec.speed;
  let aimX = spec.targetX;
  let launch = solveVy(pos, aimX, spec.targetZ, speed, spin);
  let flight = fly(pos, launch);
  for (let attempt = 0; attempt < 10; attempt++) {
    const targetOnTable = Math.abs(spec.targetZ) < TABLE_HALF_L;
    const overshoot = targetOnTable && !flight.onTable && Math.abs(flight.landZ) > TABLE_HALF_L;
    if (flight.netHit || overshoot) {
      // Bola rendah tidak bisa melewati net sekaligus mendarat di meja dengan
      // kecepatan tinggi; turunkan kecepatan sampai lintasannya mungkin.
      speed *= 0.86;
    } else {
      // Koreksi geseran samping akibat sidespin.
      const errX = flight.landX - spec.targetX;
      if (Math.abs(errX) < 0.02) break;
      aimX -= errX;
    }
    launch = solveVy(pos, aimX, spec.targetZ, speed, spin);
    flight = fly(pos, launch);
  }
  return {
    ...launch,
    landX: flight.landX,
    landZ: flight.landZ,
    valid: !flight.netHit && flight.onTable && Math.sign(flight.landZ) === dirZ,
  };
};

/**
 * Servis: pantul pertama di sisi sendiri, lalu menyeberang ke sisi lawan.
 * `power` 0..1 memilih servis pendek-lambat sampai panjang-cepat dari kandidat yang sah.
 */
export const solveServe = (pos: Vec3, aimX: number, power: number, top: number): SolvedShot => {
  const dirZ = pos.z > 0 ? -1 : 1;
  const valid = collectServes(pos, aimX, spinFor(dirZ, top, 0), dirZ);
  // Kombinasi spin dan arah tertentu tidak punya lintasan sah; topspin sedang selalu bisa.
  if (valid.length === 0) valid.push(...collectServes(pos, 0, spinFor(dirZ, 0.5, 0), dirZ));
  if (valid.length === 0) {
    const launch = solveVy(pos, 0, -dirZ * 0.9, 3, spinFor(dirZ, 0.5, 0));
    return { ...launch, landX: 0, landZ: dirZ * TABLE_HALF_L * 0.5, valid: false };
  }
  valid.sort((a, b) => Math.abs(a.landZ) - Math.abs(b.landZ));
  const idx = Math.min(valid.length - 1, Math.floor(power * valid.length));
  return valid[idx]!;
};

const SERVE_CANDIDATES = 10;

const collectServes = (pos: Vec3, aimX: number, spin: Vec3, dirZ: number): SolvedShot[] => {
  const valid: SolvedShot[] = [];
  // Tanpa topspin, servis harus memantul lebih dekat ke ujung meja sendiri.
  for (const ownDepth of [0.95, 0.8, 0.65, 0.5]) {
    for (let speed = 2.5; speed <= 8; speed += 0.25) {
      const serve = trySpecificServe(pos, aimX * 0.5, -dirZ * ownDepth, speed, spin, dirZ);
      if (serve) valid.push(serve);
      if (valid.length >= SERVE_CANDIDATES) return valid;
    }
  }
  return valid;
};

const trySpecificServe = (
  pos: Vec3,
  firstX: number,
  ownZ: number,
  speed: number,
  spin: Vec3,
  dirZ: number,
): SolvedShot | null => {
  const launch = solveVy(pos, firstX, ownZ, speed, spin);
  const b: Ball = { pos: copyVec(pos), vel: copyVec(launch.vel), spin: copyVec(launch.spin) };
  const contacts: { x: number; z: number }[] = [];
  for (let i = 0; i < MAX_FLIGHT_STEPS && contacts.length < 2; i++) {
    const c = stepBall(b);
    if (!c) continue;
    if (c.kind !== "table") return null;
    contacts.push({ x: c.x, z: c.z });
  }
  const [first, second] = contacts;
  if (!first || !second) return null;
  const firstOwn = Math.sign(first.z) === -dirZ;
  const secondOpp = Math.sign(second.z) === dirZ && Math.abs(second.z) > 0.3;
  if (!firstOwn || !secondOpp || !isOverTable(second.x, second.z)) return null;
  return { ...launch, landX: second.x, landZ: second.z, valid: true };
};

export const clampTarget = (x: number): number =>
  Math.max(-TABLE_HALF_W + 0.08, Math.min(TABLE_HALF_W - 0.08, x));

import type { Side } from "./ball";
import { REACH, TABLE_HALF_L } from "./constants";
import { chance, gaussian, nextFloat, type Rng } from "./rng";
import { type Launch, type SolvedShot, solveShot } from "./solver";
import { EDGE_FAIL_CHANCE, type TimingGrade } from "./timing";
import { clamp, type Vec3 } from "./vec";

export type ShotKind = "serve" | "block" | "drive" | "smash" | "lob" | "weak";

export interface SwingParams {
  aim: number;
  lift: number;
  power: number;
  /** Jarak bola dari tengah bat (m); pukulan di tepi bat lebih tidak akurat. */
  offset: number;
}

export interface Shot {
  kind: ShotKind;
  launch: Launch;
}

interface Plan {
  kind: ShotKind;
  speed: number;
  depth: number;
  top: number;
  side: number;
  aimX: number;
  sigma: number;
}

const resolvePlan = (from: Vec3, hitter: Side, plan: Plan, rng: Rng): SolvedShot => {
  const dirZ = hitter === 0 ? -1 : 1;
  const targetX = plan.aimX + gaussian(rng, plan.sigma);
  const targetZ = dirZ * (plan.depth + gaussian(rng, plan.sigma * 1.2));
  return solveShot(from, {
    targetX,
    targetZ,
    speed: plan.speed,
    top: plan.top,
    side: plan.side,
  });
};

/** Pukulan mode ayunan: kekuatan dan arah dari gerakan pointer/keyboard. */
export const swingShot = (from: Vec3, hitter: Side, s: SwingParams, rng: Rng): Shot => {
  const power = clamp(s.power, 0, 1);
  const aim = clamp(s.aim, -1, 1);
  const lift = clamp(s.lift, -1, 1);
  const edge = clamp(s.offset / REACH, 0, 1);
  const smash = power > 0.85 && from.y > 0.18;
  const kind: ShotKind = smash ? "smash" : power < 0.25 ? "block" : "drive";
  const plan: Plan = {
    kind,
    // Kecepatan dibuat lebih lambat dari aslinya agar enak dimainkan di layar HP.
    speed: smash ? 12 + power * 2 : 4 + power * 6.5,
    depth: 0.6 + power * 0.6,
    top: smash ? 0.6 : lift,
    side: aim * 0.4,
    aimX: aim * 0.6,
    // Pukulan keras, bersudut tajam, atau kena tepi bat lebih berisiko keluar.
    sigma: 0.05 + power * power * 0.2 + Math.abs(aim) * 0.06 + edge * edge * 0.25,
  };
  return { kind, launch: resolvePlan(from, hitter, plan, rng) };
};

const TIMING_PLANS: Record<Exclude<TimingGrade, "miss">, Omit<Plan, "aimX" | "side">> = {
  perfect: { kind: "smash", speed: 12.5, depth: 1.15, top: 0.7, sigma: 0.02 },
  great: { kind: "drive", speed: 9.5, depth: 1.0, top: 0.4, sigma: 0.04 },
  good: { kind: "lob", speed: 4, depth: 0.9, top: 0.1, sigma: 0.05 },
  early: { kind: "weak", speed: 5, depth: 0.7, top: 0, sigma: 0.06 },
  late: { kind: "weak", speed: 5, depth: 0.7, top: 0, sigma: 0.06 },
};

/** Pukulan mode Timing Smash: jenis pukulan ditentukan nilai timing. */
export const timingShot = (
  from: Vec3,
  hitter: Side,
  grade: Exclude<TimingGrade, "miss">,
  aim: number,
  speedFactor: number,
  rng: Rng,
): Shot => {
  const base = TIMING_PLANS[grade];
  const a = clamp(aim, -1, 1);
  const plan: Plan = { ...base, speed: base.speed * speedFactor, aimX: a * 0.55, side: a * 0.3 };
  const dirZ = hitter === 0 ? -1 : 1;
  if ((grade === "early" || grade === "late") && chance(rng, EDGE_FAIL_CHANCE)) {
    if (nextFloat(rng) < 0.5) {
      // Nyangkut net: lintasan sengaja dibuat terlalu rendah.
      const solved = resolvePlan(from, hitter, plan, rng);
      solved.vel.y -= 1.6;
      return { kind: "weak", launch: solved };
    }
    const out = solveShot(from, {
      targetX: plan.aimX,
      targetZ: dirZ * (TABLE_HALF_L + 0.35),
      speed: plan.speed,
      top: 0,
      side: 0,
    });
    return { kind: "weak", launch: out };
  }
  return { kind: plan.kind, launch: resolvePlan(from, hitter, plan, rng) };
};

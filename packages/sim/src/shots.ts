import type { Side } from "./ball";
import { REACH, TABLE_HALF_L } from "./constants";
import { chance, gaussian, nextFloat, type Rng } from "./rng";
import { type Launch, type SolvedShot, solveShot } from "./solver";
import { EDGE_FAIL_CHANCE, type TimingGrade } from "./timing";
import { clamp, type Vec3 } from "./vec";

// Urutan dipakai protokol jaringan (SHOTS di binary.ts): jenis baru hanya ditambah di akhir.
export type ShotKind =
  | "serve"
  | "block"
  | "drive"
  | "smash"
  | "lob"
  | "weak"
  | "loop"
  | "chop"
  | "drop"
  | "curve";

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

export interface ShotBoost {
  speed: number;
  sigma: number;
  /** Kemampuan "Bola Melengkung": sidespin penuh dan sudut lebih tajam. */
  curve: boolean;
  /** Kemampuan "Mode Smash": smash bisa dari bola lebih rendah dan tenaga lebih kecil. */
  easySmash: boolean;
}

export const NO_BOOST: Readonly<ShotBoost> = Object.freeze({
  speed: 1,
  sigma: 1,
  curve: false,
  easySmash: false,
});

/** Tepi bat (0 = tengah, 1 = ujung jangkauan) yang masih dihitung titik manis (PERFECT). */
export const SWEET_SPOT = 0.25;
/** Ayunan sangat pelan tidak dihitung PERFECT walau kena tengah bat. */
export const SWEET_MIN_POWER = 0.3;

/**
 * Jenis pukulan ayunan dari gerakan pemain: cepat = keras, ke atas = topspin, ke bawah =
 * backspin. Kombinasinya menghasilkan smash, loop, chop, drop shot, lob, blok, atau drive.
 */
export const classifySwing = (power: number, lift: number, height: number, easySmash = false) => {
  const smashPower = easySmash ? 0.6 : 0.85;
  const smashHeight = easySmash ? 0.1 : 0.18;
  if (power > smashPower && height > smashHeight) return "smash" as const;
  if (power < 0.3 && lift < -0.3) return "drop" as const;
  if (power < 0.35 && lift > 0.55) return "lob" as const;
  if (lift < -0.5) return "chop" as const;
  if (lift > 0.55 && power >= 0.35) return "loop" as const;
  if (power < 0.25) return "block" as const;
  return "drive" as const;
};

const swingPlan = (
  kind: ReturnType<typeof classifySwing>,
  power: number,
  lift: number,
): Pick<Plan, "speed" | "depth" | "top"> & { risk: number } => {
  // `risk` mengalikan sebaran: topspin dan backspin berat lebih aman dari drive datar,
  // drop shot halus tetapi sempit.
  switch (kind) {
    case "smash":
      return { speed: 12 + power * 2, depth: 1.15, top: 0.6, risk: 1 };
    case "loop":
      return { speed: 6 + power * 5, depth: 1.1, top: 1, risk: 0.75 };
    case "chop":
      return { speed: 4.5 + power * 3, depth: 1.05, top: -1, risk: 0.7 };
    case "drop":
      return { speed: 2.4 + power * 2, depth: 0.38, top: -0.6, risk: 0.9 };
    case "lob":
      return { speed: 3 + power, depth: 1.12, top: 0.3, risk: 0.6 };
    default:
      return { speed: 4 + power * 6.5, depth: 0.6 + power * 0.6, top: lift, risk: 1 };
  }
};

/** Pukulan mode ayunan: kekuatan dan arah dari gerakan pointer/keyboard. */
export const swingShot = (
  from: Vec3,
  hitter: Side,
  s: SwingParams,
  rng: Rng,
  boost: ShotBoost = NO_BOOST,
): Shot => {
  const power = clamp(s.power, 0, 1);
  const aim = clamp(s.aim, -1, 1);
  const lift = clamp(s.lift, -1, 1);
  const edge = clamp(s.offset / REACH, 0, 1);
  const base = classifySwing(power, lift, from.y, boost.easySmash);
  const p = swingPlan(base, power, lift);
  const curve = boost.curve && base !== "smash";
  // Bola melengkung: sidespin penuh ke arah bidikan (atau acak bila lurus).
  const curveDir = !curve || aim !== 0 ? Math.sign(aim) || 1 : nextFloat(rng) < 0.5 ? -1 : 1;
  const plan: Plan = {
    kind: curve ? "curve" : base,
    // Kecepatan dibuat lebih lambat dari aslinya agar enak dimainkan di layar HP.
    speed: p.speed * boost.speed,
    depth: p.depth,
    top: p.top,
    side: curve ? curveDir : aim * 0.4,
    aimX: curve ? curveDir * 0.55 : aim * 0.6,
    // Pukulan keras, bersudut tajam, atau kena tepi bat lebih berisiko keluar.
    sigma:
      (0.05 + power * power * 0.2 + Math.abs(aim) * 0.06 + edge * edge * 0.25) *
      p.risk *
      boost.sigma,
  };
  const launch = resolvePlan(from, hitter, plan, rng);
  // Kesalahan manusiawi: pukulan sangat keras sesekali terlalu rendah dan menyangkut net.
  // Berlaku sama untuk semua pemain; kontrol yang lebih baik (sigma kecil) mengurangi peluangnya.
  const netRisk = Math.max(0, power - 0.8) * 0.5 * Math.min(1.5, boost.sigma);
  if (netRisk > 0 && nextFloat(rng) < netRisk) launch.vel.y -= 1.4;
  return { kind: plan.kind, launch };
};

const TIMING_PLANS: Record<Exclude<TimingGrade, "miss">, Omit<Plan, "aimX" | "side">> = {
  perfect: { kind: "smash", speed: 12.5, depth: 1.15, top: 0.7, sigma: 0.02 },
  great: { kind: "drive", speed: 9.5, depth: 1.0, top: 0.4, sigma: 0.04 },
  good: { kind: "lob", speed: 4, depth: 0.9, top: 0.1, sigma: 0.05 },
  early: { kind: "weak", speed: 5, depth: 0.7, top: 0, sigma: 0.06 },
  late: { kind: "weak", speed: 5, depth: 0.7, top: 0, sigma: 0.06 },
};

type TimingPlan = Omit<Plan, "aimX" | "side">;

// Variasi agar Timing Smash tidak monoton: GREAT bisa drive atau loop, GOOD bisa lob atau
// chop; dengan "Mode Smash" GREAT pun menjadi smash.
const TIMING_VARIANTS: Partial<
  Record<Exclude<TimingGrade, "miss">, (rng: Rng, boost: ShotBoost) => TimingPlan>
> = {
  great: (rng, boost) =>
    boost.easySmash
      ? TIMING_PLANS.perfect
      : nextFloat(rng) < 0.5
        ? TIMING_PLANS.great
        : { kind: "loop", speed: 8.5, depth: 1.1, top: 1, sigma: 0.04 },
  good: (rng) =>
    nextFloat(rng) < 0.5
      ? TIMING_PLANS.good
      : { kind: "chop", speed: 5, depth: 1.0, top: -1, sigma: 0.05 },
};

/** Pukulan mode Timing Smash: jenis pukulan ditentukan nilai timing. */
export const timingShot = (
  from: Vec3,
  hitter: Side,
  grade: Exclude<TimingGrade, "miss">,
  aim: number,
  speedFactor: number,
  rng: Rng,
  boost: ShotBoost = NO_BOOST,
): Shot => {
  const base = TIMING_VARIANTS[grade]?.(rng, boost) ?? TIMING_PLANS[grade];
  const a = clamp(aim, -1, 1);
  const curve = boost.curve && base.kind !== "smash";
  const plan: Plan = {
    ...base,
    kind: curve ? "curve" : base.kind,
    speed: base.speed * speedFactor * boost.speed,
    aimX: curve ? (a < 0 ? -0.55 : 0.55) : a * 0.55,
    side: curve ? (a < 0 ? -1 : 1) : a * 0.3,
  };
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

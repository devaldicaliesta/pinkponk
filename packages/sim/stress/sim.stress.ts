// Uji beban simulasi: ribuan pertandingan acak (termasuk input sampah) harus selalu
// selesai, tetap deterministik, dan tidak pernah menghasilkan NaN atau posisi liar.
// Jalankan: pnpm test:stress  (STRESS_MATCHES mengatur jumlah pertandingan).
import { describe, expect, it } from "vitest";
import {
  AiController,
  BAT_MAX_X,
  type Difficulty,
  emptyInput,
  Match,
  type PlayerInput,
  type PlayMode,
  STACK_MAX,
  TICK_RATE,
} from "../src";
import { createRng, nextFloat, type Rng } from "../src/rng";

const MATCHES = Number(process.env.STRESS_MATCHES ?? 200);
// Batas waktu simulasi per pertandingan best of 1 (menit simulasi).
const MAX_TICKS = TICK_RATE * 60 * 20;
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

const pick = <T>(rng: Rng, list: readonly T[]): T =>
  list[Math.floor(nextFloat(rng) * list.length)] as T;

const GARBAGE = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  1e308,
  -1e308,
  0,
  -0,
];

/** Input pemain jahil/rusak: nilai sembarang, NaN, tak hingga, tick masa depan. */
const fuzzInput = (rng: Rng, tick: number): PlayerInput => {
  const wild = () =>
    nextFloat(rng) < 0.2
      ? pick(rng, GARBAGE)
      : (nextFloat(rng) - 0.5) * 2 * 10 ** (nextFloat(rng) * 3);
  return {
    viewTick: nextFloat(rng) < 0.1 ? wild() : tick - Math.floor(nextFloat(rng) * 400),
    x: wild(),
    aim: wild(),
    lift: wild(),
    power: wild(),
    serve: nextFloat(rng) < 0.05,
    tapMs: nextFloat(rng) < 0.05 ? wild() : null,
    ability: nextFloat(rng) < 0.02,
  };
};

const finite = (...n: number[]) => n.every(Number.isFinite);

interface Outcome {
  ticks: number;
  fingerprint: string;
  abilities: number;
}

const playOne = (seed: number, check: boolean): Outcome => {
  const rng = createRng(seed);
  const mode: PlayMode = nextFloat(rng) < 0.5 ? "swing" : "timing";
  const gamble = nextFloat(rng) < 0.6;
  const fuzz = nextFloat(rng) < 0.4;
  const m = new Match({ mode, bestOf: 1, seed, gamble, skipCountdown: nextFloat(rng) < 0.5 });
  const ai0 = new AiController(0, pick(rng, DIFFICULTIES), seed + 1);
  const ai1 = new AiController(1, pick(rng, DIFFICULTIES), seed + 2);
  let abilities = 0;
  for (let i = 0; i < MAX_TICKS && m.phase !== "over"; i++) {
    m.pushInput(0, fuzz ? fuzzInput(rng, m.tick) : ai0.input(m));
    m.pushInput(1, ai1.input(m));
    m.step();
    for (const e of m.events) if (e.type === "ability") abilities++;
    if (!check) continue;
    const b = m.ball;
    if (
      !finite(b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z, b.spin.x, b.spin.y, b.spin.z)
    ) {
      throw new Error(`seed ${seed}: bola NaN di tick ${m.tick}`);
    }
    if (Math.abs(b.pos.x) > 50 || Math.abs(b.pos.z) > 50 || b.pos.y > 50) {
      throw new Error(`seed ${seed}: bola keluar dunia di tick ${m.tick}`);
    }
    for (const p of m.players) {
      if (!Number.isFinite(p.batX) || Math.abs(p.batX) > BAT_MAX_X + 1e-9) {
        throw new Error(
          `seed ${seed}: bat tidak sah (${p.batX}) di tick ${m.tick} ${mode} ${m.phase}`,
        );
      }
      if (p.gamble.stack < 0 || p.gamble.stack > STACK_MAX || p.gamble.pointsLeft < 0) {
        throw new Error(`seed ${seed}: status gamble tidak sah di tick ${m.tick}`);
      }
    }
  }
  return {
    ticks: m.tick,
    abilities,
    fingerprint: JSON.stringify([m.phase, m.tick, m.score, m.winner, m.ball]),
  };
};

describe("stress: simulasi", () => {
  it(`${MATCHES} pertandingan acak (AI dan input sampah) selalu selesai tanpa state rusak`, async () => {
    const started = performance.now();
    let ticks = 0;
    let abilities = 0;
    let unfinished = 0;
    for (let s = 1; s <= MATCHES; s++) {
      const o = playOne(s * 7919, true);
      ticks += o.ticks;
      abilities += o.abilities;
      if (!o.fingerprint.startsWith('["over"')) unfinished++;
      // Beri jeda ke event loop agar runner Vitest tetap responsif selama uji panjang.
      if (s % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    const cpuS = (performance.now() - started) / 1000;
    const simS = ticks / TICK_RATE;
    console.log(
      `[stress] ${MATCHES} pertandingan, ${(simS / 60).toFixed(0)} menit simulasi dalam ${cpuS.toFixed(1)} dtk CPU` +
        ` → ${(simS / cpuS).toFixed(0)}× waktu nyata; ${abilities} kemampuan dipakai`,
    );
    expect(unfinished).toBe(0);
    expect(abilities).toBeGreaterThan(0);
    // Satu room online = satu pertandingan; harus jauh lebih cepat dari waktu nyata.
    expect(simS / cpuS).toBeGreaterThan(50);
  });

  it("pertandingan yang sama diulang memberi hasil identik (replay deterministik)", async () => {
    for (let s = 1; s <= 20; s++) {
      expect(playOne(s * 104729, false).fingerprint).toBe(playOne(s * 104729, false).fingerprint);
      await new Promise((r) => setTimeout(r, 0));
    }
  });

  it("input kosong terus-menerus: servis otomatis tetap menyelesaikan pertandingan", () => {
    const m = new Match({ mode: "swing", bestOf: 1, seed: 1, gamble: true, skipCountdown: true });
    for (let i = 0; i < MAX_TICKS && m.phase !== "over"; i++) {
      m.pushInput(0, { ...emptyInput(m.tick), x: 1.1 });
      m.pushInput(1, { ...emptyInput(m.tick), x: -1.1 });
      m.step();
    }
    expect(m.phase).toBe("over");
  });
});

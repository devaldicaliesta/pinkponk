import { describe, expect, it } from "vitest";
import { AI_PROFILES, AiController } from "./ai";
import { DT, MAX_LAG_TICKS, MS_PER_TICK } from "./constants";
import { Match } from "./match";
import { emptyInput, type MatchConfig, type MatchEvent, type PlayMode } from "./types";

const aiMatch = (mode: PlayMode, seed: number, extra: Partial<MatchConfig> = {}) => {
  const m = new Match({ mode, bestOf: 1, seed, skipCountdown: true, ...extra });
  const ai = [new AiController(0, "medium", seed + 1), new AiController(1, "medium", seed + 2)];
  const tick = () => {
    m.pushInput(0, ai[0]!.input(m));
    m.pushInput(1, ai[1]!.input(m));
    m.step();
  };
  return { m, tick };
};

const fingerprint = (m: Match) =>
  JSON.stringify([m.tick, m.phase, m.ball, m.score, m.players.map((p) => p.batX)]);

/** Pemain 1 servis, pemain 0 menerima; kembalikan tick ideal pukulan pemain 0. */
const serveToPlayer0 = (mode: PlayMode) => {
  const m = new Match({ mode, bestOf: 1, seed: 3, skipCountdown: true, firstServer: 1 });
  m.pushInput(1, { ...emptyInput(0), serve: true, power: 0.5, lift: 0.3 });
  let crossing: number | null = null;
  for (let i = 0; i < 600 && crossing === null; i++) {
    m.pushInput(0, emptyInput(m.tick));
    m.step();
    if (m.phase === "rally") crossing = m.upcomingCrossing(0)?.tick ?? null;
  }
  if (crossing === null) throw new Error("servis tidak sampai ke pemain 0");
  return { m, ideal: crossing };
};

const runUntil = (m: Match, tick: number, input: (t: number) => ReturnType<typeof emptyInput>) => {
  const events: MatchEvent[] = [];
  while (m.tick < tick) {
    m.pushInput(0, input(m.tick));
    m.step();
    events.push(...m.events);
  }
  return events;
};

describe("Match", () => {
  it("deterministik: seed dan input sama menghasilkan state identik", () => {
    const a = aiMatch("swing", 42);
    const b = aiMatch("swing", 42);
    for (let i = 0; i < 10_000; i++) {
      a.tick();
      b.tick();
    }
    expect(fingerprint(a.m)).toBe(fingerprint(b.m));
  });

  it("pertandingan AI vs AI selesai dengan skor sah", () => {
    const { m, tick } = aiMatch("swing", 7);
    for (let i = 0; i < 120 * 60 * 20 && m.phase !== "over"; i++) tick();
    expect(m.phase).toBe("over");
    const w = m.winner!;
    expect(m.score.games[w]).toBe(1);
  });

  it("mode timing AI vs AI juga selesai", () => {
    const { m, tick } = aiMatch("timing", 11);
    for (let i = 0; i < 120 * 60 * 30 && m.phase !== "over"; i++) tick();
    expect(m.phase).toBe("over");
  });

  it("bat AI tidak pernah bergerak melebihi kecepatan maksimum", () => {
    const speed = AI_PROFILES.easy.speed;
    const m = new Match({
      mode: "swing",
      bestOf: 1,
      seed: 5,
      skipCountdown: true,
      batSpeed: [7, speed],
    });
    const ai = [new AiController(0, "hard", 1), new AiController(1, "easy", 2)];
    let prev = m.players[1].batX;
    for (let i = 0; i < 6000; i++) {
      m.pushInput(0, ai[0]!.input(m));
      m.pushInput(1, ai[1]!.input(m));
      m.step();
      expect(Math.abs(m.players[1].batX - prev)).toBeLessThanOrEqual(speed * DT + 1e-9);
      prev = m.players[1].batX;
    }
  });

  it("timing: tap tepat waktu → PERFECT dan bola dikembalikan", () => {
    const { m, ideal } = serveToPlayer0("timing");
    const events = runUntil(m, ideal + 40, (t) => ({
      ...emptyInput(t),
      tapMs: t === ideal ? ideal * MS_PER_TICK + 5 : null,
    }));
    expect(events).toContainEqual({ type: "judge", player: 0, grade: "perfect" });
    expect(events.some((e) => e.type === "hit" && e.player === 0 && e.shot === "smash")).toBe(true);
  });

  it("timing: tap 200 ms terlambat → LATE", () => {
    const { m, ideal } = serveToPlayer0("timing");
    const late = ideal + Math.round(200 / MS_PER_TICK);
    const events = runUntil(m, late + 5, (t) => ({
      ...emptyInput(t),
      tapMs: t === late ? late * MS_PER_TICK : null,
    }));
    expect(events).toContainEqual({ type: "judge", player: 0, grade: "late" });
  });

  it("timing: tidak tap → MISS dan poin untuk lawan", () => {
    const { m, ideal } = serveToPlayer0("timing");
    const events = runUntil(m, ideal + 120, (t) => emptyInput(t));
    expect(events).toContainEqual({ type: "judge", player: 0, grade: "miss" });
    expect(events).toContainEqual({ type: "point", winner: 1, reason: "miss" });
  });

  it("timing: tap jauh terlalu awal → MISS (tidak bisa tap berulang)", () => {
    const { m, ideal } = serveToPlayer0("timing");
    const early = ideal - Math.round(270 / MS_PER_TICK);
    const events = runUntil(m, ideal + 120, (t) => ({
      ...emptyInput(t),
      tapMs: t === early || t === ideal ? t * MS_PER_TICK : null,
    }));
    expect(events).toContainEqual({ type: "judge", player: 0, grade: "miss" });
  });

  it("forfeit: lawan menang dan pertandingan selesai", () => {
    const m = new Match({ mode: "swing", bestOf: 3, seed: 1, skipCountdown: true });
    m.forfeit(0);
    expect(m.winner).toBe(1);
    expect(m.phase).toBe("over");
    expect(m.events).toContainEqual({ type: "match", winner: 1 });
  });

  it("ayunan: bat di posisi bola → bola dikembalikan", () => {
    const { m, ideal } = serveToPlayer0("swing");
    const x = m.upcomingCrossing(0)!.x;
    const events = runUntil(m, ideal + 5, (t) => ({ ...emptyInput(t), x, power: 0.5 }));
    expect(events.some((e) => e.type === "hit" && e.player === 0)).toBe(true);
  });

  it("ayunan: bat jauh dari bola → gagal mengembalikan", () => {
    const { m, ideal } = serveToPlayer0("swing");
    const x = m.upcomingCrossing(0)!.x > 0 ? -1 : 1;
    const events = runUntil(m, ideal + 60, (t) => ({ ...emptyInput(t), x }));
    expect(events).toContainEqual({ type: "point", winner: 1, reason: "miss" });
  });

  it("kompensasi lag: input yang tiba terlambat tetap dinilai pada tick yang dilihat pemain", () => {
    const { m, ideal } = serveToPlayer0("swing");
    const x = m.upcomingCrossing(0)!.x;
    const lag = 20;
    expect(lag).toBeLessThan(MAX_LAG_TICKS);
    const events = runUntil(m, ideal + lag + 2, (t) => ({
      ...emptyInput(t - lag),
      x,
      power: 0.5,
    }));
    expect(events.some((e) => e.type === "hit" && e.player === 0)).toBe(true);
    expect(m.ball.vel.z).toBeLessThan(0);
  });
});

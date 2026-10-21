import { describe, expect, it } from "vitest";
import { AiController } from "./ai";
import {
  ABILITIES,
  addStack,
  canActivate,
  createGamble,
  modsFor,
  ROULETTE,
  rollAbility,
  STACK_MAX,
  tickPoint,
} from "./gamble";
import { Match } from "./match";
import { createRng } from "./rng";
import { emptyInput, type MatchEvent } from "./types";

const fullStack = () => {
  const g = createGamble();
  addStack(g, STACK_MAX + 3);
  return g;
};

describe("gamble: aturan dasar", () => {
  it("stack dibatasi maksimum dan baru bisa dipakai saat penuh", () => {
    const g = createGamble();
    addStack(g, STACK_MAX - 1);
    expect(canActivate(g)).toBe(false);
    addStack(g, 5);
    expect(g.stack).toBe(STACK_MAX);
    expect(canActivate(g)).toBe(true);
  });

  it("roulette hanya menghasilkan kemampuan sah dengan durasi 1–2 poin", () => {
    const rng = createRng(1);
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const r = rollAbility(rng);
      expect(ABILITIES).toContain(r.ability);
      expect(r.points).toBeGreaterThanOrEqual(1);
      expect(r.points).toBeLessThanOrEqual(2);
      seen.add(r.ability);
    }
    // Semua irisan roulette punya peluang muncul.
    expect(seen.size).toBe(ROULETTE.length);
  });

  it("freeze lawan memperlambat bat, jinx mengecilkan jangkauan sendiri", () => {
    const me = createGamble();
    const them = createGamble();
    them.ability = "freeze";
    expect(modsFor(me, them).batSpeed).toBeLessThan(1);
    me.ability = "jinx";
    expect(modsFor(me, them).reach).toBeLessThan(1);
  });

  it("kemampuan berakhir setelah jumlah poinnya habis", () => {
    const g = fullStack();
    g.ability = "giant";
    g.pointsLeft = 2;
    expect(tickPoint(g)).toBe(false);
    expect(tickPoint(g)).toBe(true);
    expect(g.ability).toBeNull();
  });
});

const run = (m: Match, ticks: number, input = () => emptyInput(m.tick)) => {
  const events: MatchEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    m.pushInput(0, input());
    m.pushInput(1, emptyInput(m.tick));
    m.step();
    events.push(...m.events);
  }
  return events;
};

describe("gamble di dalam Match", () => {
  it("tombol kemampuan diabaikan bila mode gamble mati", () => {
    const m = new Match({ mode: "swing", bestOf: 1, seed: 1, skipCountdown: true });
    addStack(m.players[0].gamble, STACK_MAX);
    const events = run(m, 2, () => ({ ...emptyInput(m.tick), ability: true }));
    expect(events.some((e) => e.type === "ability")).toBe(false);
    expect(m.players[0].gamble.ability).toBeNull();
  });

  it("stack penuh + tombol memutar roulette dan mengosongkan stack", () => {
    const m = new Match({ mode: "swing", bestOf: 1, seed: 5, skipCountdown: true, gamble: true });
    addStack(m.players[0].gamble, STACK_MAX);
    const events = run(m, 1, () => ({ ...emptyInput(m.tick), ability: true }));
    const e = events.find((x) => x.type === "ability");
    expect(e).toBeDefined();
    expect(m.players[0].gamble.stack).toBe(0);
    expect(m.players[0].gamble.ability).not.toBeNull();
  });

  it("stack belum penuh: tombol tidak berpengaruh", () => {
    const m = new Match({ mode: "swing", bestOf: 1, seed: 5, skipCountdown: true, gamble: true });
    addStack(m.players[0].gamble, STACK_MAX - 1);
    run(m, 1, () => ({ ...emptyInput(m.tick), ability: true }));
    expect(m.players[0].gamble.ability).toBeNull();
  });

  it("poin ganda menambah dua poin, tapi tidak melewati akhir game", () => {
    const m = new Match({ mode: "swing", bestOf: 3, seed: 9, skipCountdown: true, gamble: true });
    const endPoint = (m as unknown as { endPoint(r: object): void }).endPoint.bind(m);
    m.players[0].gamble.ability = "double";
    m.players[0].gamble.pointsLeft = 2;
    endPoint({ kind: "point", winner: 0, reason: "out" });
    expect(m.score.points).toEqual([2, 0]);
    // 10–3 lalu poin ganda: game dimenangkan, skor game baru mulai dari 0, bukan 1.
    m.score.points = [10, 3];
    endPoint({ kind: "point", winner: 0, reason: "out" });
    expect(m.score.games).toEqual([1, 0]);
    expect(m.score.points).toEqual([0, 0]);
    expect(m.players[0].gamble.ability).toBeNull();
  });

  it("perisai menyelamatkan satu bola yang terlewat", () => {
    const m = new Match({
      mode: "swing",
      bestOf: 1,
      seed: 11,
      skipCountdown: true,
      gamble: true,
      firstServer: 1,
    });
    m.players[0].gamble.ability = "shield";
    m.players[0].gamble.pointsLeft = 2;
    m.pushInput(1, { ...emptyInput(0), serve: true, power: 0.4 });
    // Pemain 0 sengaja menaruh bat jauh dari bola.
    const events = run(m, 500, () => ({ ...emptyInput(m.tick), x: 1.1 }));
    expect(events.some((e) => e.type === "shield" && e.player === 0)).toBe(true);
    expect(m.players[0].gamble.shieldUsed || m.players[0].gamble.ability === null).toBe(true);
  });

  it("AI vs AI mode gamble selesai, deterministik, dan kemampuan benar-benar dipakai", () => {
    const play = (seed: number) => {
      const m = new Match({ mode: "swing", bestOf: 1, seed, skipCountdown: true, gamble: true });
      const ai = [new AiController(0, "medium", seed + 1), new AiController(1, "hard", seed + 2)];
      let abilities = 0;
      for (let i = 0; i < 120 * 60 * 20 && m.phase !== "over"; i++) {
        m.pushInput(0, ai[0]!.input(m));
        m.pushInput(1, ai[1]!.input(m));
        m.step();
        abilities += m.events.filter((e) => e.type === "ability").length;
      }
      return { m, abilities, fp: JSON.stringify([m.tick, m.score, m.ball]) };
    };
    const a = play(21);
    const b = play(21);
    expect(a.m.phase).toBe("over");
    expect(a.abilities).toBeGreaterThan(0);
    expect(a.fp).toBe(b.fp);
  });
});

describe("gamble dan AI", () => {
  it("bola hantu membuat AI lebih sering meleset", () => {
    const misses = (ghost: boolean) => {
      let total = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const m = new Match({ mode: "swing", bestOf: 1, seed, skipCountdown: true, gamble: true });
        const me = new AiController(0, "hard", seed);
        const ai = new AiController(1, "medium", seed + 50);
        for (let i = 0; i < 120 * 60; i++) {
          if (ghost) {
            m.players[0].gamble.ability = "ghost";
            m.players[0].gamble.pointsLeft = 9;
          }
          m.pushInput(0, { ...me.input(m), ability: false });
          m.pushInput(1, { ...ai.input(m), ability: false });
          m.step();
          for (const e of m.events) {
            if (e.type === "point" && e.reason === "miss" && e.winner === 0) total++;
          }
          if (m.phase === "over") break;
        }
      }
      return total;
    };
    expect(misses(true)).toBeGreaterThan(misses(false));
  }, 20_000);
});

describe("gamble di mode Timing Smash", () => {
  it("bat raksasa melebarkan jendela timing, sial dan bekukan lawan menyempitkannya", () => {
    const me = createGamble();
    const them = createGamble();
    me.ability = "giant";
    expect(modsFor(me, them).timingWindow).toBeGreaterThan(1);
    me.ability = "jinx";
    expect(modsFor(me, them).timingWindow).toBeLessThan(1);
    me.ability = null;
    them.ability = "freeze";
    expect(modsFor(me, them).timingWindow).toBeLessThan(1);
  });

  it("tap 140 ms terlambat: GOOD biasanya, GREAT dengan bat raksasa", () => {
    const judgeAt = (giant: boolean) => {
      const m = new Match({
        mode: "timing",
        bestOf: 1,
        seed: 3,
        skipCountdown: true,
        firstServer: 1,
        gamble: true,
      });
      if (giant) {
        m.players[0].gamble.ability = "giant";
        m.players[0].gamble.pointsLeft = 3;
      }
      m.pushInput(1, { ...emptyInput(0), serve: true });
      let ideal: number | null = null;
      for (let i = 0; i < 900 && ideal === null; i++) {
        m.pushInput(0, emptyInput(m.tick));
        m.step();
        if (m.phase === "rally") ideal = m.upcomingCrossing(0)?.tick ?? null;
      }
      const tapMs = ((ideal as number) * 1000) / 120 + 140;
      const grades: string[] = [];
      for (let i = 0; i < 400 && grades.length === 0; i++) {
        const tap = m.nowMs >= tapMs && m.nowMs < tapMs + 9 ? tapMs : null;
        m.pushInput(0, { ...emptyInput(m.tick), tapMs: tap });
        m.step();
        for (const e of m.events) if (e.type === "judge" && e.player === 0) grades.push(e.grade);
      }
      return grades[0];
    };
    expect(judgeAt(false)).toBe("good");
    expect(judgeAt(true)).toBe("great");
  });

  it("AI vs AI Timing Smash mode gamble selesai dan memakai kemampuan", () => {
    const m = new Match({ mode: "timing", bestOf: 1, seed: 77, skipCountdown: true, gamble: true });
    const ai = [new AiController(0, "medium", 78), new AiController(1, "hard", 79)];
    let abilities = 0;
    for (let i = 0; i < 120 * 60 * 20 && m.phase !== "over"; i++) {
      m.pushInput(0, ai[0]!.input(m));
      m.pushInput(1, ai[1]!.input(m));
      m.step();
      abilities += m.events.filter((e) => e.type === "ability").length;
    }
    expect(m.phase).toBe("over");
    expect(abilities).toBeGreaterThan(0);
  }, 20_000);
});

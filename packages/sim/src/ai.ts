import type { Side } from "./ball";
import { MS_PER_TICK, TICK_RATE } from "./constants";
import { canActivate } from "./gamble";
import type { Match } from "./match";
import { createRng, gaussian, nextFloat, type Rng, range } from "./rng";
import { other } from "./score";
import type { PlayerInput } from "./types";

export type Difficulty = "easy" | "medium" | "hard";

export interface AiProfile {
  reactionMs: number;
  errorM: number;
  speed: number;
  powerMin: number;
  powerMax: number;
  topspin: number;
  /** Simpangan tap (ms) di mode timing. */
  tapSigmaMs: number;
  serveDelayMs: [number, number];
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy: {
    reactionMs: 350,
    errorM: 0.3,
    speed: 2.5,
    powerMin: 0.2,
    powerMax: 0.55,
    topspin: 0.1,
    tapSigmaMs: 120,
    serveDelayMs: [900, 1500],
  },
  medium: {
    reactionMs: 220,
    errorM: 0.18,
    speed: 3.5,
    powerMin: 0.35,
    powerMax: 0.8,
    topspin: 0.4,
    tapSigmaMs: 65,
    serveDelayMs: [700, 1200],
  },
  hard: {
    reactionMs: 140,
    errorM: 0.1,
    speed: 4.5,
    powerMin: 0.5,
    powerMax: 0.95,
    topspin: 0.7,
    tapSigmaMs: 38,
    serveDelayMs: [500, 900],
  },
};

/** Pengendali AI: membaca state Match dan menghasilkan input seperti pemain manusia. */
export class AiController {
  readonly profile: AiProfile;
  private readonly rng: Rng;
  private lastHits = -1;
  private reactAt = 0;
  private errorX = 0;
  private plan = { aim: 0, lift: 0, power: 0.5 };
  private serveAt = -1;
  private plannedTapMs: number | null = null;
  private tapSent = false;

  constructor(
    readonly side: Side,
    difficulty: Difficulty,
    seed: number,
  ) {
    this.profile = AI_PROFILES[difficulty];
    this.rng = createRng(seed ^ 0x9e3779b9);
  }

  input(m: Match): PlayerInput {
    const me = m.players[this.side];
    const input: PlayerInput = {
      viewTick: m.tick,
      x: me.batX,
      aim: this.plan.aim,
      lift: this.plan.lift,
      power: this.plan.power,
      serve: false,
      tapMs: null,
      ability: this.wantsAbility(m),
    };
    if (m.phase === "serve" && m.server === this.side) {
      if (this.serveAt < m.phaseTick) {
        const [a, b] = this.profile.serveDelayMs;
        this.serveAt = m.phaseTick + Math.round((range(this.rng, a, b) / 1000) * TICK_RATE);
        this.newPlan(m);
      }
      input.serve = m.tick >= this.serveAt;
      return input;
    }
    const hits = m.rally?.hits ?? -1;
    if (hits !== this.lastHits) {
      this.lastHits = hits;
      if (m.rally && m.rally.lastHitter !== this.side) {
        // Bola hantu lawan sulit dibaca: AI bereaksi lebih lambat dan lebih meleset.
        const ghost = m.config.gamble && m.players[other(this.side)].gamble.ability === "ghost";
        const reaction = this.profile.reactionMs + (ghost ? 140 : 0);
        this.reactAt = m.tick + Math.round((reaction / 1000) * TICK_RATE);
        this.errorX = gaussian(this.rng, this.profile.errorM * (ghost ? 2.2 : 1));
        this.plannedTapMs = null;
        this.tapSent = false;
        this.newPlan(m);
      }
    }
    if (m.tick < this.reactAt) return input;
    const crossing = m.upcomingCrossing(this.side);
    if (crossing) {
      input.x = crossing.x + this.errorX;
      if (m.config.mode === "timing" && this.plannedTapMs === null) {
        const sigma = this.tapSigma(m);
        this.plannedTapMs = crossing.tick * MS_PER_TICK + gaussian(this.rng, sigma);
      }
    } else if (!m.rally || m.rally.lastHitter === this.side) {
      input.x = me.batX * 0.98;
    }
    if (this.plannedTapMs !== null && !this.tapSent && m.nowMs >= this.plannedTapMs) {
      input.tapMs = this.plannedTapMs;
      this.tapSent = true;
    }
    return input;
  }

  // Kemampuan dipakai di sela poin, seperti pemain manusia yang menunggu bola mati.
  private wantsAbility(m: Match): boolean {
    if (!m.config.gamble || !canActivate(m.players[this.side].gamble)) return false;
    return m.phase === "point" || (m.phase === "serve" && m.tick - m.phaseTick > TICK_RATE / 3);
  }

  // Reli yang makin cepat dan smash lawan membuat timing AI makin meleset.
  private tapSigma(m: Match): number {
    const hits = m.rally?.hits ?? 0;
    const speed = Math.hypot(m.ball.vel.x, m.ball.vel.z);
    const ghost = m.config.gamble && m.players[other(this.side)].gamble.ability === "ghost";
    return this.profile.tapSigmaMs * (1 + 0.06 * hits) * (speed > 11 ? 1.8 : 1) * (ghost ? 1.8 : 1);
  }

  private newPlan(m: Match): void {
    const p = this.profile;
    // AI yang lebih pintar mengarahkan bola menjauhi bat lawan.
    const opponentX = m.players[other(this.side)].batX;
    const away = opponentX > 0 ? -1 : 1;
    const smart = nextFloat(this.rng) < p.topspin;
    this.plan = {
      aim: smart ? away * range(this.rng, 0.4, 1) : range(this.rng, -0.8, 0.8),
      lift: range(this.rng, -0.3, 1) * p.topspin,
      power: range(this.rng, p.powerMin, p.powerMax),
    };
  }
}

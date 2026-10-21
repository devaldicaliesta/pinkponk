import type { Side } from "./ball";
import { MS_PER_TICK, REACH, TICK_RATE } from "./constants";
import { canActivate } from "./gamble";
import type { Match } from "./match";
import { createRng, gaussian, nextFloat, type Rng, range } from "./rng";
import { gameWinner, other, POINTS_TO_WIN } from "./score";
import type { PlayerInput } from "./types";

export type Difficulty = "easy" | "medium" | "hard" | "legend";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "legend"];

/** Gaya bermain AI, terpisah dari tingkat kesulitan. */
export type Personality = "allround" | "defender" | "attacker" | "spinner";
export const PERSONALITIES: readonly Personality[] = [
  "allround",
  "defender",
  "attacker",
  "spinner",
];

interface Style {
  /** Pengali tenaga dan peluang smash. */
  power: number;
  aggression: number;
  /** Pengali sebaran pukulan (lebih kecil = lebih konsisten). */
  control: number;
  /** Bobot pilihan pukulan taktis. */
  mix: { loop: number; chop: number; drop: number; lob: number; drive: number };
  /** Seberapa lebar sudut yang dibidik (0..1). */
  wide: number;
  /** Peluang pura-pura smash lalu memukul pelan (drop). */
  feint: number;
}

const STYLES: Record<Personality, Style> = {
  allround: {
    power: 1,
    aggression: 1,
    control: 1,
    mix: { loop: 35, chop: 20, drop: 13, lob: 0, drive: 32 },
    wide: 0.8,
    feint: 0.05,
  },
  // Tembok: jarang menyerang, mengembalikan apa saja dengan chop dan lob. Reli panjang.
  defender: {
    power: 0.85,
    aggression: 0.3,
    control: 1.5,
    mix: { loop: 10, chop: 45, drop: 10, lob: 15, drive: 20 },
    wide: 0.6,
    feint: 0,
  },
  // Penyerang: tukang smash dan loop keras, suka menipu, tetapi lebih sering salah.
  attacker: {
    power: 1.1,
    aggression: 1.4,
    control: 0.85,
    mix: { loop: 50, chop: 5, drop: 15, lob: 0, drive: 30 },
    wide: 0.9,
    feint: 0.2,
  },
  // Pemutar: spin berat ke segala arah dan sudut tajam yang melengkung.
  spinner: {
    power: 0.95,
    aggression: 0.7,
    control: 1.1,
    mix: { loop: 40, chop: 40, drop: 10, lob: 0, drive: 10 },
    wide: 1,
    feint: 0.05,
  },
};

/** Kecepatan bat dan kontrol (pengali sebaran) AI untuk MatchConfig. */
export const aiSkill = (d: Difficulty, p: Personality = "allround") => ({
  speed: AI_PROFILES[d].speed,
  control: AI_PROFILES[d].control * STYLES[p].control,
});

export interface AiProfile {
  reactionMs: number;
  /** Simpangan posisi bat terhadap titik pukul (m). */
  errorM: number;
  /** Kecepatan bat maksimum (m/s). */
  speed: number;
  powerMin: number;
  powerMax: number;
  /** Peluang memakai pukulan taktis: menjauhi lawan, loop/chop/drop, smash bola tinggi. */
  tactics: number;
  /** Peluang men-smash bola yang datang tinggi. */
  aggression: number;
  /** Seberapa cepat bat kembali ke tengah setelah memukul (0 = diam di tempat). */
  recover: number;
  /** Tambahan tenaga per pukulan dalam satu reli (makin lama makin berani, makin berisiko). */
  rallyHeat: number;
  /** Pengali sebaran pukulan: kontrol bola AI (1 = sama dengan pemain). */
  control: number;
  /** Peluang salah baca bola sama sekali (meleset jauh), kesalahan yang terasa manusiawi. */
  whiff: number;
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
    powerMax: 0.5,
    tactics: 0.05,
    aggression: 0,
    recover: 0,
    rallyHeat: 0,
    control: 1.4,
    whiff: 0.06,
    tapSigmaMs: 120,
    serveDelayMs: [900, 1500],
  },
  medium: {
    reactionMs: 220,
    errorM: 0.17,
    speed: 3.5,
    powerMin: 0.3,
    powerMax: 0.65,
    tactics: 0.3,
    aggression: 0.2,
    recover: 0.3,
    rallyHeat: 0,
    control: 1.05,
    whiff: 0.03,
    tapSigmaMs: 65,
    serveDelayMs: [700, 1200],
  },
  hard: {
    reactionMs: 150,
    errorM: 0.1,
    speed: 5,
    powerMin: 0.35,
    powerMax: 0.7,
    tactics: 0.6,
    aggression: 0.5,
    recover: 0.6,
    rallyHeat: 0.005,
    control: 0.72,
    whiff: 0.015,
    tapSigmaMs: 42,
    serveDelayMs: [500, 900],
  },
  // Legenda: cepat, tajam, dan gemar menyerang. Kelemahannya disengaja dan bisa dibaca:
  // makin panjang reli makin nekat (lebih sering keluar), dan setelah kehilangan dua poin
  // beruntun ia "panas" sebentar. Bertahan dan sabar adalah kunci mengalahkannya.
  legend: {
    reactionMs: 95,
    errorM: 0.05,
    speed: 6.5,
    powerMin: 0.45,
    powerMax: 0.7,
    tactics: 0.9,
    aggression: 0.85,
    recover: 0.9,
    rallyHeat: 0.014,
    control: 0.47,
    whiff: 0.008,
    tapSigmaMs: 37,
    serveDelayMs: [400, 700],
  },
};

interface Plan {
  aim: number;
  lift: number;
  power: number;
}

/** Pengendali AI: membaca state Match dan menghasilkan input seperti pemain manusia. */
export class AiController {
  readonly profile: AiProfile;
  readonly style: Style;
  /**
   * Pukulan yang "diperlihatkan" sebelum memukul (ancang-ancang), dipakai renderer untuk
   * pose bersiap smash. Saat menipu, ancang-ancangnya smash padahal pukulannya drop shot.
   */
  intent: "smash" | null = null;
  private readonly rng: Rng;
  private lastHits = -1;
  private reactAt = 0;
  private errorX = 0;
  private plan: Plan = { aim: 0, lift: 0, power: 0.5 };
  private planned = false;
  private serveAt = -1;
  private plannedTapMs: number | null = null;
  private tapSent = false;
  private lastOpponentX = 0;
  private opponentVel = 0;
  private lostStreak = 0;
  private lastScore = "";

  constructor(
    readonly side: Side,
    difficulty: Difficulty,
    seed: number,
    readonly personality: Personality = "allround",
  ) {
    this.profile = AI_PROFILES[difficulty];
    this.style = STYLES[personality];
    this.rng = createRng(seed ^ 0x9e3779b9);
  }

  input(m: Match): PlayerInput {
    const me = m.players[this.side];
    this.observe(m);
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
        this.plan = this.servePlan();
        input.aim = this.plan.aim;
        input.lift = this.plan.lift;
        input.power = this.plan.power;
      }
      input.serve = m.tick >= this.serveAt;
      return input;
    }
    const hits = m.rally?.hits ?? -1;
    if (hits !== this.lastHits) {
      this.lastHits = hits;
      if (m.rally && m.rally.lastHitter !== this.side) {
        // Bola hantu lawan sulit dibaca: AI bereaksi lebih lambat dan lebih meleset.
        const ghost = this.opponentHas(m, "ghost");
        const reaction = this.profile.reactionMs + (ghost ? 140 : 0);
        this.reactAt = m.tick + Math.round((reaction / 1000) * TICK_RATE);
        this.errorX = gaussian(this.rng, this.errorM(m) * (ghost ? 2.2 : 1));
        // Sesekali salah baca bola sama sekali, seperti manusia yang kecolongan.
        if (nextFloat(this.rng) < this.profile.whiff) {
          this.errorX = (nextFloat(this.rng) < 0.5 ? -1 : 1) * REACH * 1.4;
        }
        this.plannedTapMs = null;
        this.tapSent = false;
        this.planned = false;
        this.intent = null;
      }
    }
    if (m.tick < this.reactAt) return input;
    const crossing = m.upcomingCrossing(this.side);
    if (crossing) {
      input.x = crossing.x + this.errorX;
      if (!this.planned) {
        this.plan = this.rallyPlan(m, crossing.y);
        this.planned = true;
      }
      input.aim = this.plan.aim;
      input.lift = this.plan.lift;
      input.power = this.plan.power;
      if (m.config.mode === "timing" && this.plannedTapMs === null) {
        const sigma = this.tapSigma(m);
        this.plannedTapMs = crossing.tick * MS_PER_TICK + gaussian(this.rng, sigma);
      }
    } else if (!m.rally || m.rally.lastHitter === this.side) {
      // Setelah memukul, kembali ke tengah agar sudut lebar lawan tetap terjangkau.
      input.x = me.batX * (1 - this.profile.recover * 0.5);
    }
    if (this.plannedTapMs !== null && !this.tapSent && m.nowMs >= this.plannedTapMs) {
      input.tapMs = this.plannedTapMs;
      this.tapSent = true;
    }
    return input;
  }

  /** Lacak gerak bat lawan dan rentetan poin untuk taktik dan "emosi" AI. */
  private observe(m: Match): void {
    const ox = m.players[other(this.side)].batX;
    this.opponentVel = this.opponentVel * 0.8 + (ox - this.lastOpponentX) * TICK_RATE * 0.2;
    this.lastOpponentX = ox;
    const key = `${m.score.games.join()}|${m.score.points.join()}`;
    if (key === this.lastScore) return;
    const [prevGames, prevPoints] = this.lastScore.split("|");
    this.lastScore = key;
    if (prevPoints === undefined) return;
    const before = prevPoints.split(",").map(Number);
    const mineNow = m.score.points[this.side];
    const theirsNow = m.score.points[other(this.side)];
    const gameChanged = prevGames !== m.score.games.join();
    if (gameChanged) {
      this.lostStreak = 0;
      return;
    }
    if (theirsNow > (before[other(this.side)] ?? 0)) this.lostStreak += 1;
    else if (mineNow > (before[this.side] ?? 0)) this.lostStreak = 0;
  }

  private opponentHas(m: Match, ability: string): boolean {
    return m.config.gamble === true && m.players[other(this.side)].gamble.ability === ability;
  }

  /** Fokus saat lawan di game point; sedikit goyah setelah kalah beruntun. */
  private errorM(m: Match): number {
    const p = this.profile;
    const theirs = m.score.points[other(this.side)];
    const facingGamePoint =
      theirs >= POINTS_TO_WIN - 1 &&
      theirs > m.score.points[this.side] &&
      gameWinner(m.score) === null;
    const tilt = this.lostStreak >= 2 ? 1.25 : 1;
    return p.errorM * (facingGamePoint && p.tactics > 0.5 ? 0.6 : 1) * tilt;
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
    const ghost = this.opponentHas(m, "ghost");
    return this.profile.tapSigmaMs * (1 + 0.06 * hits) * (speed > 11 ? 1.8 : 1) * (ghost ? 1.8 : 1);
  }

  private servePlan(): Plan {
    const p = this.profile;
    // Servis bervariasi: pendek/panjang, topspin/backspin, kiri/kanan.
    const tricky = nextFloat(this.rng) < p.tactics;
    return {
      aim: range(this.rng, -1, 1) * (tricky ? 1 : 0.6),
      lift: tricky ? (nextFloat(this.rng) < 0.5 ? -0.6 : 0.8) : range(this.rng, -0.2, 0.5),
      power: tricky ? (nextFloat(this.rng) < 0.5 ? 0.1 : 0.9) : range(this.rng, 0.3, 0.7),
    };
  }

  private rallyPlan(m: Match, ballHeight: number): Plan {
    const p = this.profile;
    const st = this.style;
    const hits = m.rally?.hits ?? 0;
    // Makin panjang reli makin bertenaga (dan berisiko); "panas" setelah kalah beruntun.
    const heat = Math.min(0.25, p.rallyHeat * hits) + (this.lostStreak >= 2 ? p.rallyHeat * 6 : 0);
    const power = Math.min(1, range(this.rng, p.powerMin, p.powerMax) * st.power + heat);
    if (nextFloat(this.rng) >= p.tactics) {
      return { aim: range(this.rng, -0.8, 0.8), lift: range(this.rng, -0.2, 0.6), power };
    }
    // Arahkan ke sisi yang ditinggalkan lawan, memperhitungkan arah geraknya.
    const predicted = this.lastOpponentX + this.opponentVel * 0.25;
    const away = predicted > 0 ? -1 : 1;
    const aim = away * range(this.rng, 0.35, 0.35 + 0.6 * st.wide);
    if (ballHeight > 0.24 && nextFloat(this.rng) < p.aggression * st.aggression) {
      this.intent = "smash";
      // Tipuan: ancang-ancang smash, tetapi bola diletakkan pendek di dekat net.
      if (nextFloat(this.rng) < st.feint) return { aim: aim * 0.5, lift: -0.6, power: 0.12 };
      // Smash yang terkontrol: penuh tenaga hanya bila bola sangat tinggi.
      return { aim: aim * 0.8, lift: 0, power: ballHeight > 0.32 ? 1 : 0.9 };
    }
    const options: [number, () => Plan][] = [
      [st.mix.loop, () => ({ aim, lift: range(this.rng, 0.65, 1), power: Math.max(0.45, power) })],
      [
        st.mix.chop,
        () => ({ aim, lift: range(this.rng, -1, -0.6), power: range(this.rng, 0.35, 0.6) }),
      ],
      [st.mix.drop, () => ({ aim: aim * 0.6, lift: -0.6, power: range(this.rng, 0.08, 0.2) })],
      [st.mix.lob, () => ({ aim: aim * 0.7, lift: 0.9, power: range(this.rng, 0.1, 0.25) })],
    ];
    const total = options.reduce((sum, [w]) => sum + w, st.mix.drive);
    let r = nextFloat(this.rng) * total;
    for (const [weight, make] of options) {
      if (r < weight) return make();
      r -= weight;
    }
    return { aim, lift: range(this.rng, 0, 0.4), power };
  }
}

import type { Ability, FaultReason, MatchEvent, ShotKind, Side, TimingGrade } from "@pinkponk/sim";
import { getSettings } from "../state/settings";
import { play, vibrate } from "./audio";
import { type Moment, MomentTracker } from "./moments";
import type { GameRenderer } from "./renderer";
import type { MatchView } from "./session";

export interface MatchStats {
  longestRally: number;
  perfects: number;
  timingHits: number;
  abilities: number;
  jackpot: boolean;
  pointsWon: number;
}

export const emptyStats = (): MatchStats => ({
  longestRally: 0,
  perfects: 0,
  timingHits: 0,
  abilities: 0,
  jackpot: false,
  pointsWon: 0,
});

export interface RouletteInfo {
  key: number;
  player: Side;
  ability: Ability;
  points: number;
}

/** Lama roulette berputar sebelum hasilnya diumumkan (ms). */
export const ROULETTE_SPIN_MS = 900;
const ROULETTE_SHOW_MS = 2000;

/** Pukulan yang namanya diumumkan di layar; drive dan block biasa tidak perlu. */
export type CalledShot = "smash" | "loop" | "chop" | "drop" | "curve" | "lob";
const CALLED: readonly ShotKind[] = ["smash", "loop", "chop", "drop", "curve", "lob"];
const isCalled = (s: ShotKind): s is CalledShot => CALLED.includes(s);

const SHOT_SFX: Partial<Record<ShotKind, "smash" | "loop" | "chop" | "drop">> = {
  smash: "smash",
  loop: "loop",
  curve: "loop",
  chop: "chop",
  drop: "drop",
};

const gradeSound = (g: TimingGrade) =>
  g === "perfect" ? "perfect" : g === "great" ? "great" : g === "miss" ? "miss" : "hit";

/**
 * Menerjemahkan event pertandingan menjadi umpan balik: suara, getaran, pose karakter,
 * label di HUD, hit-stop/slow-mo, dan statistik.
 */
export class Feedback {
  toast: { key: number; reason: FaultReason | "let" } | null = null;
  judge: { key: number; grade: TimingGrade } | null = null;
  emoji: { key: number; player: Side; e: number } | null = null;
  roulette: RouletteInfo | null = null;
  shield: { key: number; player: Side } | null = null;
  shot: { key: number; shot: CalledShot; mine: boolean } | null = null;
  moment: (Moment & { key: number; mine: boolean }) | null = null;
  /** Waktu (performance.now) sampai simulasi lokal ditahan / diperlambat. */
  stopUntil = 0;
  slowUntil = 0;
  matchEnded = false;
  stats: MatchStats = emptyStats();
  private toastUntil = 0;
  private judgeUntil = 0;
  private emojiUntil = 0;
  private rouletteUntil = 0;
  private shieldUntil = 0;
  private shotUntil = 0;
  private momentUntil = 0;
  private key = 0;
  private readonly moments = new MomentTracker();

  constructor(
    private readonly renderer: GameRenderer,
    private readonly you: Side | null,
    private readonly canSlowTime: boolean,
    private readonly reducedMotion: boolean,
  ) {}

  private mine(p: Side): boolean {
    return this.you === null || this.you === p;
  }

  showEmoji(player: Side, e: number, now: number): void {
    this.emoji = { key: ++this.key, player, e };
    this.emojiUntil = now + 1200;
  }

  handle(e: MatchEvent, now: number, view: MatchView): void {
    this.renderer.onEvent(e, now, view);
    const moment = this.moments.feed(e, view.points);
    if (moment) {
      this.moment = { ...moment, key: ++this.key, mine: this.mine(moment.player) };
      this.momentUntil = now + 1400;
      play("moment");
    }
    const haptics = getSettings().haptics;
    switch (e.type) {
      case "bounce":
        play("bounce");
        break;
      case "net":
        play("net");
        break;
      case "hit":
        play(SHOT_SFX[e.shot] ?? "hit");
        if (isCalled(e.shot)) {
          this.shot = { key: ++this.key, shot: e.shot, mine: this.mine(e.player) };
          this.shotUntil = now + 650;
        }
        if (this.mine(e.player)) vibrate(e.shot === "smash" ? 40 : 12, haptics);
        if (e.shot === "smash" && e.grade === "perfect" && this.canSlowTime) {
          this.stopUntil = now + 60;
          this.slowUntil = this.reducedMotion ? 0 : now + 60 + 350;
        }
        break;
      case "judge":
        // Penilaian lawan tidak ditampilkan: yang penting bagi pemain adalah timing-nya sendiri.
        if (!this.mine(e.player)) break;
        this.judge = { key: ++this.key, grade: e.grade };
        this.judgeUntil = now + 450;
        play(gradeSound(e.grade));
        if (this.you === e.player) {
          this.stats.timingHits += 1;
          if (e.grade === "perfect") this.stats.perfects += 1;
        }
        break;
      case "ability":
        this.roulette = { key: ++this.key, player: e.player, ability: e.ability, points: e.points };
        this.rouletteUntil = now + ROULETTE_SPIN_MS + ROULETTE_SHOW_MS;
        play("spin");
        setTimeout(() => play(e.ability === "jinx" ? "jinx" : "ability"), ROULETTE_SPIN_MS);
        if (this.mine(e.player)) {
          this.stats.abilities += 1;
          if (e.ability === "jackpot") this.stats.jackpot = true;
          vibrate([20, 40, 20], haptics);
        }
        break;
      case "shield":
        this.shield = { key: ++this.key, player: e.player };
        this.shieldUntil = now + 1100;
        play("shield");
        break;
      case "point":
        this.toast = { key: ++this.key, reason: e.reason };
        if (this.you !== null && e.reason !== "let" && e.winner === this.you) {
          // Poin ganda dihitung dari skor akhir di ringkasan; di sini cukup jumlah reli dimenangkan.
          this.stats.pointsWon += 1;
        }
        this.toastUntil = now + 1100;
        this.stats.longestRally = Math.max(this.stats.longestRally, view.rallyHits);
        if (this.you !== null && e.reason !== "let") play(e.winner === this.you ? "win" : "lose");
        break;
      case "fever":
        if (e.on) play("fever");
        break;
      case "match":
        this.matchEnded = true;
        break;
      default:
        break;
    }
  }

  expire(now: number): void {
    if (now > this.toastUntil) this.toast = null;
    if (now > this.judgeUntil) this.judge = null;
    if (now > this.emojiUntil) this.emoji = null;
    if (now > this.rouletteUntil) this.roulette = null;
    if (now > this.shieldUntil) this.shield = null;
    if (now > this.shotUntil) this.shot = null;
    if (now > this.momentUntil) this.moment = null;
  }

  timeScale(now: number, base: number): number {
    if (now < this.stopUntil) return 0;
    if (now < this.slowUntil) return 0.35;
    return base;
  }

  reset(): void {
    this.stats = emptyStats();
    this.matchEnded = false;
  }
}

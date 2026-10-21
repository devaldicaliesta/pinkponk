import type { FaultReason, MatchEvent, Side, TimingGrade } from "@pinkponk/sim";
import { getSettings } from "../state/settings";
import { play, vibrate } from "./audio";
import type { GameRenderer } from "./renderer";
import type { MatchView } from "./session";

export interface MatchStats {
  longestRally: number;
  perfects: number;
  timingHits: number;
}

export const emptyStats = (): MatchStats => ({ longestRally: 0, perfects: 0, timingHits: 0 });

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
  /** Waktu (performance.now) sampai simulasi lokal ditahan / diperlambat. */
  stopUntil = 0;
  slowUntil = 0;
  matchEnded = false;
  stats: MatchStats = emptyStats();
  private toastUntil = 0;
  private judgeUntil = 0;
  private emojiUntil = 0;
  private key = 0;

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
    const haptics = getSettings().haptics;
    switch (e.type) {
      case "bounce":
        play("bounce");
        break;
      case "net":
        play("net");
        break;
      case "hit":
        play(e.shot === "smash" ? "smash" : "hit");
        if (this.mine(e.player)) vibrate(e.shot === "smash" ? 40 : 12, haptics);
        if (e.shot === "smash" && e.grade === "perfect" && this.canSlowTime) {
          this.stopUntil = now + 60;
          this.slowUntil = this.reducedMotion ? 0 : now + 60 + 350;
        }
        break;
      case "judge":
        this.judge = { key: ++this.key, grade: e.grade };
        this.judgeUntil = now + 450;
        play(gradeSound(e.grade));
        if (this.you === e.player) {
          this.stats.timingHits += 1;
          if (e.grade === "perfect") this.stats.perfects += 1;
        }
        break;
      case "point":
        this.toast = { key: ++this.key, reason: e.reason };
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

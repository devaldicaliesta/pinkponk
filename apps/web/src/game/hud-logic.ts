import { COUNTDOWN_TICKS, POINTS_TO_WIN, type Side, TICK_RATE } from "@pinkponk/sim";
import type { MatchView, SessionKind } from "./session";

export type Badge = "deuce" | "gamePoint" | "matchPoint" | null;
export type ServeHint = "tap" | "key" | "p2" | "wait" | null;

export const badgeFor = (v: MatchView, bestOf: number): Badge => {
  if (v.phase === "over" || v.phase === "countdown") return null;
  const [a, b] = v.points;
  const deuceZone = POINTS_TO_WIN - 1;
  if (a === b) return a >= deuceZone ? "deuce" : null;
  const leader: Side = a > b ? 0 : 1;
  // Satu poin lagi untuk menang game.
  if (v.points[leader] < deuceZone) return null;
  return v.games[leader] === Math.ceil(bestOf / 2) - 1 ? "matchPoint" : "gamePoint";
};

/** 3-2-1 selama fase hitung mundur, lalu "Mulai!" (0) sesaat di servis pertama. */
export const countdownFor = (v: MatchView): number | null => {
  if (v.phase === "countdown") {
    const left = COUNTDOWN_TICKS - (v.tick - v.phaseTick);
    return Math.max(1, Math.ceil(left / TICK_RATE));
  }
  const firstServe = v.points[0] + v.points[1] === 0 && v.games[0] + v.games[1] === 0;
  if (v.phase === "serve" && firstServe && v.tick - v.phaseTick < TICK_RATE * 0.6) return 0;
  return null;
};

export const serveHintFor = (
  kind: SessionKind,
  you: Side | null,
  v: MatchView,
  coarsePointer: boolean,
): ServeHint => {
  if (v.phase !== "serve") return null;
  if (kind === "local") return v.server === 1 ? "p2" : "key";
  if (you === null) return null;
  if (v.server !== you) return "wait";
  return coarsePointer ? "tap" : "key";
};

import type { Side } from "./ball";
import { other } from "./score";

export type FaultReason =
  | "serve-fault"
  | "own-side"
  | "out"
  | "net"
  | "double-bounce"
  | "miss"
  | "timeout";

/**
 * Fase reli:
 * - serve-own: servis dipukul, harus memantul di sisi server
 * - serve-cross: sudah memantul di sisi server, harus memantul di sisi penerima
 * - in-flight: dipukul, harus memantul di sisi lawan pemukul
 * - await-return: sudah memantul sekali di sisi `expected`, pemain itu harus memukul
 */
export type RallyPhase = "serve-own" | "serve-cross" | "in-flight" | "await-return";

export interface Rally {
  phase: RallyPhase;
  lastHitter: Side;
  expected: Side;
  hits: number;
  touchedNet: boolean;
}

export type RallyResult =
  | { kind: "continue" }
  | { kind: "point"; winner: Side; reason: FaultReason }
  | { kind: "let" };

const CONTINUE: RallyResult = { kind: "continue" };

const lose = (loser: Side, reason: FaultReason): RallyResult => ({
  kind: "point",
  winner: other(loser),
  reason,
});

export const startServe = (server: Side): Rally => ({
  phase: "serve-own",
  lastHitter: server,
  expected: other(server),
  hits: 1,
  touchedNet: false,
});

export const onTableBounce = (r: Rally, side: Side): RallyResult => {
  switch (r.phase) {
    case "serve-own":
      if (side !== r.lastHitter) return lose(r.lastHitter, "serve-fault");
      r.phase = "serve-cross";
      return CONTINUE;
    case "serve-cross":
      if (side === r.lastHitter) return lose(r.lastHitter, "serve-fault");
      if (r.touchedNet) return { kind: "let" };
      r.phase = "await-return";
      return CONTINUE;
    case "in-flight":
      if (side === r.lastHitter) return lose(r.lastHitter, r.touchedNet ? "net" : "own-side");
      r.phase = "await-return";
      return CONTINUE;
    case "await-return":
      return lose(r.expected, "double-bounce");
  }
};

export const onNetTouch = (r: Rally): void => {
  r.touchedNet = true;
};

/** Pemain `p` memukul bola. Hanya sah saat bola menunggu dikembalikan oleh `p`. */
export const onHit = (r: Rally, p: Side): RallyResult => {
  if (r.phase !== "await-return" || r.expected !== p) {
    // Memukul sebelum bola memantul di sisi sendiri (volley) atau memukul dua kali.
    return lose(p, r.lastHitter === p ? "double-bounce" : "miss");
  }
  r.phase = "in-flight";
  r.lastHitter = p;
  r.expected = other(p);
  r.hits += 1;
  r.touchedNet = false;
  return CONTINUE;
};

/** Bola jatuh ke lantai / keluar tanpa memantul lagi di meja. */
export const onDead = (r: Rally): RallyResult => {
  switch (r.phase) {
    case "serve-own":
    case "serve-cross":
      return lose(r.lastHitter, "serve-fault");
    case "in-flight":
      return lose(r.lastHitter, r.touchedNet ? "net" : "out");
    case "await-return":
      return lose(r.expected, "miss");
  }
};

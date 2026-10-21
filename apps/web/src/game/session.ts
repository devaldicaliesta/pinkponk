import type { MatchEvent, MatchPhase, PlayMode, Side, Vec3 } from "@pinkponk/sim";

export interface BallView {
  pos: Vec3;
  vel: Vec3;
  spin: Vec3;
}

export interface MatchView {
  tick: number;
  phase: MatchPhase;
  phaseTick: number;
  server: Side;
  winner: Side | null;
  points: [number, number];
  games: [number, number];
  fever: [boolean, boolean];
  rallyHits: number;
  ball: BallView;
  bats: [number, number];
}

export interface CrossingView {
  /** ms simulasi saat bola tiba di titik pukul. */
  atMs: number;
  x: number;
  y: number;
  z: number;
}

export type SessionKind = "ai" | "local" | "online";

export interface NetStatus {
  pingMs: number | null;
  paused: { player: Side; resumeBy: number; reason: "disconnect" | "request" } | null;
  pausesLeft: [number, number];
  opponentLeft: boolean;
  reconnecting: boolean;
  rematch: [boolean, boolean];
}

export interface Session {
  readonly kind: SessionKind;
  readonly mode: PlayMode;
  /** Pemain yang dikendalikan perangkat ini; null untuk 2 pemain lokal. */
  readonly you: Side | null;
  readonly names: [string, string];
  readonly bestOf: number;
  /** Majukan state sampai waktu dinding `wallMs`. */
  update(wallMs: number): void;
  view(): MatchView;
  drainEvents(): MatchEvent[];
  /** Waktu simulasi (ms) yang sedang ditampilkan. */
  viewMs(): number;
  crossing(p: Side): CrossingView | null;
  setPaused(paused: boolean): void;
  canPause(): boolean;
  rematch(): void;
  net(): NetStatus | null;
  /** Tap buatan untuk pemain di perangkat ini (hook E2E). */
  injectTap?(wallMs: number): void;
  dispose(): void;
}

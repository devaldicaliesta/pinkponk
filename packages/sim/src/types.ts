import type { Side } from "./ball";
import type { FaultReason } from "./rules";
import type { BestOf } from "./score";
import type { ShotKind } from "./shots";
import type { TimingGrade } from "./timing";

export type PlayMode = "swing" | "timing";

export interface MatchConfig {
  mode: PlayMode;
  bestOf: BestOf;
  seed: number;
  firstServer?: Side;
  /** Kecepatan bat maksimum per pemain (m/s); AI memakai nilai sesuai tingkat. */
  batSpeed?: [number, number];
  /** Lewati hitung mundur (dipakai test). */
  skipCountdown?: boolean;
}

export interface PlayerInput {
  /** Tick simulasi yang sedang dilihat pemain saat input dibuat. */
  viewTick: number;
  /** Posisi bat lateral (m). */
  x: number;
  aim: number;
  lift: number;
  power: number;
  /** Tombol servis ditekan sejak input sebelumnya. */
  serve: boolean;
  /** Waktu tap (ms simulasi, menurut tampilan pemain) untuk mode timing. */
  tapMs: number | null;
}

export const emptyInput = (viewTick = 0): PlayerInput => ({
  viewTick,
  x: 0,
  aim: 0,
  lift: 0,
  power: 0,
  serve: false,
  tapMs: null,
});

export type MatchPhase = "countdown" | "serve" | "toss" | "rally" | "point" | "over";

export type MatchEvent =
  | { type: "bounce"; side: Side; x: number; z: number }
  | { type: "net" }
  | { type: "floor" }
  | { type: "toss"; player: Side }
  | { type: "hit"; player: Side; shot: ShotKind; grade: TimingGrade | null }
  | { type: "judge"; player: Side; grade: TimingGrade }
  | { type: "point"; winner: Side; reason: FaultReason | "let" }
  | { type: "game"; winner: Side }
  | { type: "match"; winner: Side }
  | { type: "fever"; player: Side; on: boolean };

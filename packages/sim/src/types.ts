import type { Side } from "./ball";
import type { Ability } from "./gamble";
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
  /** Mode Gamble: kumpulkan stack lalu putar roulette kemampuan. */
  gamble?: boolean;
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
  /** Tombol kemampuan (mode Gamble) ditekan sejak input sebelumnya. */
  ability: boolean;
}

export const emptyInput = (viewTick = 0): PlayerInput => ({
  viewTick,
  x: 0,
  aim: 0,
  lift: 0,
  power: 0,
  serve: false,
  tapMs: null,
  ability: false,
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
  | { type: "fever"; player: Side; on: boolean }
  | { type: "ability"; player: Side; ability: Ability; points: number }
  | { type: "shield"; player: Side };

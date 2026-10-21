import type { GambleView } from "@pinkponk/protocol";
import type { Side } from "@pinkponk/sim";
import type { MatchView } from "./session";

export type Aura = "good" | "rare" | "bad" | "shield" | null;

export interface AbilityLook {
  /** Skala bat yang terlihat (bat raksasa / mengecil). */
  batScale: number;
  /** Robot sedang dibekukan lawan. */
  frozen: boolean;
  aura: Aura;
}

const auraOf = (g: GambleView): Aura => {
  switch (g.ability) {
    case null:
      return null;
    case "jinx":
      return "bad";
    case "jackpot":
      return "rare";
    case "shield":
      return "shield";
    default:
      return "good";
  }
};

export const abilityLook = (mine: GambleView, theirs: GambleView): AbilityLook => ({
  batScale:
    mine.ability === "giant" || mine.ability === "jackpot"
      ? 1.5
      : mine.ability === "jinx"
        ? 0.65
        : 1,
  frozen: theirs.ability === "freeze",
  aura: auraOf(mine),
});

/** Bola sedang menjauhi pemain `p` (dipukul oleh `p` dan menuju lawan). */
const awayFrom = (v: MatchView, p: Side): boolean =>
  p === 0 ? v.ball.vel.z < 0 : v.ball.vel.z > 0;

const ownerOf = (v: MatchView, ability: "ghost" | "turbo"): Side | null => {
  if (v.gamble[0].ability === ability) return 0;
  return v.gamble[1].ability === ability ? 1 : null;
};

/**
 * Bola hantu: menghilang di tengah meja saat menuju lawan pemiliknya. Pemilik sendiri tetap
 * melihat bola samar agar tahu kemampuannya bekerja.
 */
export const ballOpacity = (v: MatchView, viewer: Side | null): number => {
  if (v.phase !== "rally") return 1;
  const owner = ownerOf(v, "ghost");
  if (owner === null || !awayFrom(v, owner)) return 1;
  const min = viewer === owner ? 0.45 : 0.04;
  const t = Math.min(1, Math.max(0, (Math.abs(v.ball.pos.z) - 0.75) / 0.45));
  return min + (1 - min) * t;
};

/** Pukulan bola kilat selalu meninggalkan jejak. */
export const turboTrail = (v: MatchView): boolean => {
  if (v.phase !== "rally") return false;
  const owner = ownerOf(v, "turbo");
  return owner !== null && awayFrom(v, owner);
};

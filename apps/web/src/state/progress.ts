import type { Difficulty, PlayMode } from "@pinkponk/sim";
import { useEffect, useState } from "preact/hooks";
import { readJson, writeJson } from "./storage";

// Progres pribadi (di perangkat): XP, level, rekor, dan pencapaian. Tidak dikirim ke server.

export interface Progress {
  xp: number;
  matches: number;
  wins: number;
  streak: number;
  bestStreak: number;
  bestRally: number;
  perfects: number;
  abilities: number;
  jackpots: number;
  hardWins: number;
  onlineWins: number;
  gambleWins: number;
  achievements: string[];
}

export interface MatchSummary {
  kind: "ai" | "online";
  mode: PlayMode;
  gamble: boolean;
  difficulty: Difficulty | null;
  won: boolean;
  pointsWon: number;
  longestRally: number;
  perfects: number;
  abilities: number;
  jackpot: boolean;
}

export const ACHIEVEMENTS = [
  "first-win",
  "hard-win",
  "rally-15",
  "perfect-10",
  "jackpot",
  "gambler-10",
  "online-win",
  "streak-3",
  "level-10",
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];

const KEY = "pp.progress";

export const emptyProgress = (): Progress => ({
  xp: 0,
  matches: 0,
  wins: 0,
  streak: 0,
  bestStreak: 0,
  bestRally: 0,
  perfects: 0,
  abilities: 0,
  jackpots: 0,
  hardWins: 0,
  onlineWins: 0,
  gambleWins: 0,
  achievements: [],
});

const count = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1e9, Math.floor(v))) : 0;

/** Data dari localStorage bisa rusak atau diubah tangan; ambil yang sah saja. */
export const sanitizeProgress = (raw: unknown): Progress => {
  const p = emptyProgress();
  if (typeof raw !== "object" || raw === null) return p;
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(p) as (keyof Progress)[]) {
    if (k !== "achievements") (p[k] as number) = count(r[k]);
  }
  p.achievements = Array.isArray(r.achievements)
    ? r.achievements.filter((a): a is AchievementId => ACHIEVEMENTS.includes(a as AchievementId))
    : [];
  return p;
};

const DIFFICULTY_BONUS: Record<Difficulty, number> = { easy: 1, medium: 1.5, hard: 2 };

export const xpFor = (s: MatchSummary): number => {
  const mult = s.kind === "online" ? 2 : s.difficulty ? DIFFICULTY_BONUS[s.difficulty] : 1;
  const base = 20 + s.pointsWon * 3 + Math.min(30, s.longestRally) + (s.won ? 40 : 0);
  return Math.round(base * mult);
};

/** Level n butuh 100 + 60·(n−1) XP; level dihitung dari total XP. */
export const levelOf = (xp: number): { level: number; into: number; need: number } => {
  let level = 1;
  let left = Math.max(0, xp);
  let need = 100;
  while (left >= need) {
    left -= need;
    level += 1;
    need = 100 + 60 * (level - 1);
  }
  return { level, into: left, need };
};

const unlocked = (p: Progress, s: MatchSummary): AchievementId[] => {
  const checks: Record<AchievementId, boolean> = {
    "first-win": p.wins >= 1,
    "hard-win": p.hardWins >= 1,
    "rally-15": s.longestRally >= 15,
    "perfect-10": s.perfects >= 10,
    jackpot: p.jackpots >= 1,
    "gambler-10": p.abilities >= 10,
    "online-win": p.onlineWins >= 1,
    "streak-3": p.bestStreak >= 3,
    "level-10": levelOf(p.xp).level >= 10,
  };
  return ACHIEVEMENTS.filter((a) => checks[a] && !p.achievements.includes(a));
};

export interface MatchReward {
  progress: Progress;
  gained: number;
  levelUp: boolean;
  unlocked: AchievementId[];
}

export const applyMatch = (prev: Progress, s: MatchSummary): MatchReward => {
  const gained = xpFor(s);
  const streak = s.won ? prev.streak + 1 : 0;
  const p: Progress = {
    ...prev,
    xp: prev.xp + gained,
    matches: prev.matches + 1,
    wins: prev.wins + (s.won ? 1 : 0),
    streak,
    bestStreak: Math.max(prev.bestStreak, streak),
    bestRally: Math.max(prev.bestRally, s.longestRally),
    perfects: prev.perfects + s.perfects,
    abilities: prev.abilities + s.abilities,
    jackpots: prev.jackpots + (s.jackpot ? 1 : 0),
    hardWins: prev.hardWins + (s.won && s.difficulty === "hard" ? 1 : 0),
    onlineWins: prev.onlineWins + (s.won && s.kind === "online" ? 1 : 0),
    gambleWins: prev.gambleWins + (s.won && s.gamble ? 1 : 0),
    achievements: [...prev.achievements],
  };
  const fresh = unlocked(p, s);
  p.achievements.push(...fresh);
  return {
    progress: p,
    gained,
    levelUp: levelOf(p.xp).level > levelOf(prev.xp).level,
    unlocked: fresh,
  };
};

let current = sanitizeProgress(readJson(KEY));
const listeners = new Set<(p: Progress) => void>();

export const getProgress = (): Progress => current;

export const recordMatch = (s: MatchSummary): MatchReward => {
  const reward = applyMatch(current, s);
  current = reward.progress;
  writeJson(KEY, current);
  for (const l of listeners) l(current);
  return reward;
};

export const useProgress = (): Progress => {
  const [p, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    return () => {
      listeners.delete(set);
    };
  }, []);
  return p;
};

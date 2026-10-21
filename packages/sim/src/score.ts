import type { Side } from "./ball";

export type BestOf = 1 | 3 | 5;

export interface Score {
  points: [number, number];
  games: [number, number];
  /** Pemain yang melakukan servis pertama di game berjalan. */
  gameFirstServer: Side;
  bestOf: BestOf;
}

export const POINTS_TO_WIN = 11;

export const createScore = (bestOf: BestOf, firstServer: Side): Score => ({
  points: [0, 0],
  games: [0, 0],
  gameFirstServer: firstServer,
  bestOf,
});

export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export const isDeuce = (s: Score): boolean =>
  s.points[0] >= POINTS_TO_WIN - 1 && s.points[1] >= POINTS_TO_WIN - 1;

/** Server bergantian tiap 2 poin, dan tiap poin saat deuce. */
export const currentServer = (s: Score): Side => {
  const total = s.points[0] + s.points[1];
  const deuceStart = (POINTS_TO_WIN - 1) * 2;
  const swaps = total < deuceStart ? Math.floor(total / 2) : deuceStart / 2 + (total - deuceStart);
  return swaps % 2 === 0 ? s.gameFirstServer : other(s.gameFirstServer);
};

export const gameWinner = (s: Score): Side | null => {
  const [a, b] = s.points;
  if (a >= POINTS_TO_WIN && a - b >= 2) return 0;
  if (b >= POINTS_TO_WIN && b - a >= 2) return 1;
  return null;
};

export const gamesToWin = (bestOf: BestOf): number => Math.ceil(bestOf / 2);

export const matchWinner = (s: Score): Side | null => {
  const need = gamesToWin(s.bestOf);
  if (s.games[0] >= need) return 0;
  if (s.games[1] >= need) return 1;
  return null;
};

export interface PointOutcome {
  gameWon: Side | null;
  matchWon: Side | null;
}

/** Tambah poin; bila game selesai, game baru dimulai dengan server pertama bergantian. */
export const awardPoint = (s: Score, winner: Side): PointOutcome => {
  s.points[winner] += 1;
  const gw = gameWinner(s);
  if (gw === null) return { gameWon: null, matchWon: null };
  s.games[gw] += 1;
  const mw = matchWinner(s);
  if (mw === null) {
    s.points = [0, 0];
    s.gameFirstServer = other(s.gameFirstServer);
  }
  return { gameWon: gw, matchWon: mw };
};

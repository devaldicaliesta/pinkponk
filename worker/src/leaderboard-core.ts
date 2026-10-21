// Peringkat global dari pertandingan online. Hasil pertandingan dihitung server (RoomCore),
// jadi client tidak bisa mengirim skor palsu. Yang disimpan hanya ID pemain (hash rahasia
// di perangkat), nickname, rating, dan jumlah menang/kalah.

export const START_RATING = 1000;
export const K_FACTOR = 32;
// Pasangan pemain yang sama hanya dihitung beberapa kali per hari agar rating tidak bisa
// "ditanam" dengan bermain melawan akun sendiri atau teman berulang-ulang.
export const PAIR_LIMIT_PER_DAY = 3;
export const DAY_MS = 86_400_000;
// Pemain yang lama tidak bermain dihapus agar data tidak menumpuk selamanya.
export const INACTIVE_PRUNE_MS = 180 * DAY_MS;
export const TOP_LIMIT = 50;

export interface PlayerRow {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  updated: number;
}

export interface RatedResult {
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
}

export interface LeaderboardStore {
  get(id: string): PlayerRow | null;
  put(row: PlayerRow): void;
  top(limit: number): PlayerRow[];
  /** Jumlah pemain dengan rating lebih tinggi. */
  countAbove(rating: number): number;
  pairCount(a: string, b: string, since: number): number;
  addPair(a: string, b: string, ts: number): void;
  prune(pairsBefore: number, playersBefore: number): void;
}

export const isPlayerId = (s: string): boolean => /^[0-9a-f]{32}$/.test(s);

export const expectedScore = (rating: number, opponent: number): number =>
  1 / (1 + 10 ** ((opponent - rating) / 400));

/** Perubahan rating pemenang (selalu ≥ 1); pihak kalah turun sebesar nilai yang sama. */
export const ratingDelta = (winner: number, loser: number): number =>
  Math.max(1, Math.round(K_FACTOR * (1 - expectedScore(winner, loser))));

export type ReportOutcome = "rated" | "pair-limit" | "invalid";

export interface RankedEntry {
  rank: number;
  name: string;
  rating: number;
  wins: number;
  losses: number;
}

const pairKey = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export class LeaderboardCore {
  constructor(private readonly store: LeaderboardStore) {}

  report(r: RatedResult, now: number): ReportOutcome {
    if (!isPlayerId(r.winnerId) || !isPlayerId(r.loserId) || r.winnerId === r.loserId) {
      return "invalid";
    }
    const [a, b] = pairKey(r.winnerId, r.loserId);
    this.store.prune(now - DAY_MS, now - INACTIVE_PRUNE_MS);
    if (this.store.pairCount(a, b, now - DAY_MS) >= PAIR_LIMIT_PER_DAY) return "pair-limit";
    const w = this.store.get(r.winnerId) ?? fresh(r.winnerId, r.winnerName, now);
    const l = this.store.get(r.loserId) ?? fresh(r.loserId, r.loserName, now);
    const d = ratingDelta(w.rating, l.rating);
    this.store.put({
      ...w,
      name: r.winnerName,
      rating: w.rating + d,
      wins: w.wins + 1,
      updated: now,
    });
    this.store.put({
      ...l,
      name: r.loserName,
      rating: Math.max(0, l.rating - d),
      losses: l.losses + 1,
      updated: now,
    });
    this.store.addPair(a, b, now);
    return "rated";
  }

  top(limit = TOP_LIMIT): RankedEntry[] {
    const rows = this.store.top(Math.min(TOP_LIMIT, Math.max(1, limit)));
    // Rating sama mendapat peringkat sama (1, 2, 2, 4).
    let prev = Number.NaN;
    let rank = 0;
    return rows.map((row, i) => {
      if (row.rating !== prev) rank = i + 1;
      prev = row.rating;
      return { rank, name: row.name, rating: row.rating, wins: row.wins, losses: row.losses };
    });
  }

  me(id: string): RankedEntry | null {
    if (!isPlayerId(id)) return null;
    const row = this.store.get(id);
    if (!row) return null;
    return {
      rank: this.store.countAbove(row.rating) + 1,
      name: row.name,
      rating: row.rating,
      wins: row.wins,
      losses: row.losses,
    };
  }
}

const fresh = (id: string, name: string, now: number): PlayerRow => ({
  id,
  name,
  rating: START_RATING,
  wins: 0,
  losses: 0,
  updated: now,
});

/** ID publik pemain = 128 bit pertama SHA-256 dari rahasia; rahasianya tidak disimpan. */
export const playerIdFromSecret = async (secret: string): Promise<string> => {
  const data = new TextEncoder().encode(`pinkponk-player:${secret}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

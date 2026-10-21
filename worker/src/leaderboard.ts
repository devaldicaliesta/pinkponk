import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import {
  LeaderboardCore,
  type LeaderboardStore,
  type PlayerRow,
  type RankedEntry,
  type RatedResult,
  type ReportOutcome,
} from "./leaderboard-core";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_rating ON players (rating DESC);
CREATE INDEX IF NOT EXISTS players_updated ON players (updated);
CREATE TABLE IF NOT EXISTS pairs (a TEXT NOT NULL, b TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS pairs_ab ON pairs (a, b, ts);
CREATE INDEX IF NOT EXISTS pairs_ts ON pairs (ts);
`;

type Row = Record<string, SqlStorageValue>;

const toPlayer = (r: Row): PlayerRow => ({
  id: String(r.id),
  name: String(r.name),
  rating: Number(r.rating),
  wins: Number(r.wins),
  losses: Number(r.losses),
  updated: Number(r.updated),
});

class SqlStore implements LeaderboardStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(SCHEMA);
  }

  get(id: string): PlayerRow | null {
    const rows = this.sql.exec("SELECT * FROM players WHERE id = ?", id).toArray();
    return rows[0] ? toPlayer(rows[0]) : null;
  }

  put(p: PlayerRow): void {
    this.sql.exec(
      `INSERT INTO players (id, name, rating, wins, losses, updated) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, rating = excluded.rating,
       wins = excluded.wins, losses = excluded.losses, updated = excluded.updated`,
      p.id,
      p.name,
      p.rating,
      p.wins,
      p.losses,
      p.updated,
    );
  }

  top(limit: number): PlayerRow[] {
    return this.sql
      .exec("SELECT * FROM players ORDER BY rating DESC, updated ASC LIMIT ?", limit)
      .toArray()
      .map(toPlayer);
  }

  countAbove(rating: number): number {
    const row = this.sql.exec("SELECT COUNT(*) AS n FROM players WHERE rating > ?", rating).one();
    return Number(row.n);
  }

  pairCount(a: string, b: string, since: number): number {
    const row = this.sql
      .exec("SELECT COUNT(*) AS n FROM pairs WHERE a = ? AND b = ? AND ts >= ?", a, b, since)
      .one();
    return Number(row.n);
  }

  addPair(a: string, b: string, ts: number): void {
    this.sql.exec("INSERT INTO pairs (a, b, ts) VALUES (?, ?, ?)", a, b, ts);
  }

  prune(pairsBefore: number, playersBefore: number): void {
    this.sql.exec("DELETE FROM pairs WHERE ts < ?", pairsBefore);
    this.sql.exec("DELETE FROM players WHERE updated < ?", playersBefore);
  }
}

/**
 * Satu instance global ("global"). Satu-satunya penyimpanan permanen di PinkPonk; isinya
 * hanya ID hash, nickname, rating, dan menang/kalah. Dipanggil lewat RPC dari Room dan Worker.
 */
export class Leaderboard extends DurableObject<Env> {
  private readonly core: LeaderboardCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new LeaderboardCore(new SqlStore(ctx.storage.sql));
  }

  report(result: RatedResult): ReportOutcome {
    return this.core.report(result, Date.now());
  }

  top(): RankedEntry[] {
    return this.core.top();
  }

  me(id: string): RankedEntry | null {
    return this.core.me(id);
  }
}

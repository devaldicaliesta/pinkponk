import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  INACTIVE_PRUNE_MS,
  LeaderboardCore,
  type LeaderboardStore,
  PAIR_LIMIT_PER_DAY,
  type PlayerRow,
  playerIdFromSecret,
  ratingDelta,
  START_RATING,
} from "./leaderboard-core";

class MemoryStore implements LeaderboardStore {
  players = new Map<string, PlayerRow>();
  pairs: { a: string; b: string; ts: number }[] = [];
  get(id: string) {
    return this.players.get(id) ?? null;
  }
  put(row: PlayerRow) {
    this.players.set(row.id, { ...row });
  }
  top(limit: number) {
    return [...this.players.values()]
      .sort((x, y) => y.rating - x.rating || x.updated - y.updated)
      .slice(0, limit);
  }
  countAbove(rating: number) {
    return [...this.players.values()].filter((p) => p.rating > rating).length;
  }
  pairCount(a: string, b: string, since: number) {
    return this.pairs.filter((p) => p.a === a && p.b === b && p.ts >= since).length;
  }
  addPair(a: string, b: string, ts: number) {
    this.pairs.push({ a, b, ts });
  }
  prune(pairsBefore: number, playersBefore: number) {
    this.pairs = this.pairs.filter((p) => p.ts >= pairsBefore);
    for (const [id, p] of this.players) if (p.updated < playersBefore) this.players.delete(id);
  }
}

const id = (c: string) => c.repeat(32);

describe("leaderboard", () => {
  it("Elo: menang melawan yang lebih kuat memberi poin lebih banyak", () => {
    expect(ratingDelta(1000, 1200)).toBeGreaterThan(ratingDelta(1200, 1000));
    expect(ratingDelta(1000, 1000)).toBe(16);
    expect(ratingDelta(3000, 0)).toBeGreaterThanOrEqual(1);
  });

  it("pertandingan pertama membuat dua pemain baru dan mengubah rating", () => {
    const core = new LeaderboardCore(new MemoryStore());
    expect(
      core.report(
        { winnerId: id("a"), winnerName: "Rara", loserId: id("b"), loserName: "Budi" },
        0,
      ),
    ).toBe("rated");
    const top = core.top();
    expect(top.map((t) => t.name)).toEqual(["Rara", "Budi"]);
    expect(top[0]).toMatchObject({ rank: 1, rating: START_RATING + 16, wins: 1, losses: 0 });
    expect(core.me(id("b"))).toMatchObject({ rank: 2, losses: 1 });
  });

  it("pasangan yang sama dibatasi per hari, lalu bisa lagi besoknya", () => {
    const core = new LeaderboardCore(new MemoryStore());
    const r = { winnerId: id("a"), winnerName: "A", loserId: id("b"), loserName: "B" };
    for (let i = 0; i < PAIR_LIMIT_PER_DAY; i++) expect(core.report(r, i)).toBe("rated");
    // Urutan pemenang/kalah dibalik tetap pasangan yang sama.
    expect(
      core.report({ winnerId: id("b"), winnerName: "B", loserId: id("a"), loserName: "A" }, 10),
    ).toBe("pair-limit");
    expect(core.report(r, DAY_MS + 10)).toBe("rated");
  });

  it("menolak ID tidak sah atau melawan diri sendiri", () => {
    const core = new LeaderboardCore(new MemoryStore());
    expect(
      core.report({ winnerId: "x", winnerName: "A", loserId: id("b"), loserName: "B" }, 0),
    ).toBe("invalid");
    expect(
      core.report({ winnerId: id("a"), winnerName: "A", loserId: id("a"), loserName: "A" }, 0),
    ).toBe("invalid");
    expect(core.me("bukan-id")).toBeNull();
  });

  it("pemain yang lama tidak aktif dihapus", () => {
    const store = new MemoryStore();
    const core = new LeaderboardCore(store);
    core.report({ winnerId: id("a"), winnerName: "A", loserId: id("b"), loserName: "B" }, 0);
    core.report(
      { winnerId: id("c"), winnerName: "C", loserId: id("d"), loserName: "D" },
      INACTIVE_PRUNE_MS + 1,
    );
    expect(store.get(id("a"))).toBeNull();
    expect(store.get(id("c"))).not.toBeNull();
  });

  it("rating sama mendapat peringkat sama", () => {
    const core = new LeaderboardCore(new MemoryStore());
    core.report({ winnerId: id("a"), winnerName: "A", loserId: id("b"), loserName: "B" }, 0);
    core.report({ winnerId: id("c"), winnerName: "C", loserId: id("d"), loserName: "D" }, 1);
    expect(core.top().map((t) => t.rank)).toEqual([1, 1, 3, 3]);
  });

  it("ID pemain stabil, 32 hex, dan tidak sama dengan rahasianya", async () => {
    const secret = "f".repeat(64);
    const a = await playerIdFromSecret(secret);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await playerIdFromSecret(secret)).toBe(a);
    expect(secret.includes(a)).toBe(false);
  });
});

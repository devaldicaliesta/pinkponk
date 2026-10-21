import { describe, expect, it } from "vitest";
import {
  applyMatch,
  emptyProgress,
  levelOf,
  type MatchSummary,
  sanitizeProgress,
  xpFor,
} from "./progress";

const match = (patch: Partial<MatchSummary> = {}): MatchSummary => ({
  kind: "ai",
  mode: "swing",
  gamble: false,
  difficulty: "medium",
  won: true,
  pointsWon: 11,
  longestRally: 6,
  perfects: 0,
  abilities: 0,
  jackpot: false,
  ...patch,
});

describe("progres pemain", () => {
  it("level naik sesuai tabel XP", () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelOf(100).level).toBe(2);
    expect(levelOf(259)).toEqual({ level: 2, into: 159, need: 160 });
    expect(levelOf(260).level).toBe(3);
  });

  it("menang dan lawan lebih sulit memberi XP lebih banyak", () => {
    expect(xpFor(match({ won: true }))).toBeGreaterThan(xpFor(match({ won: false })));
    expect(xpFor(match({ difficulty: "hard" }))).toBeGreaterThan(
      xpFor(match({ difficulty: "easy" })),
    );
    expect(xpFor(match({ kind: "online", difficulty: null }))).toBeGreaterThan(xpFor(match()));
  });

  it("pencapaian terbuka sekali saja", () => {
    const a = applyMatch(emptyProgress(), match({ difficulty: "hard" }));
    expect(a.unlocked).toEqual(expect.arrayContaining(["first-win", "hard-win"]));
    const b = applyMatch(a.progress, match({ difficulty: "hard" }));
    expect(b.unlocked).not.toContain("first-win");
  });

  it("menang lawan Legenda membuka pencapaian Legenda dan Sulit", () => {
    const r = applyMatch(emptyProgress(), match({ difficulty: "legend" }));
    expect(r.unlocked).toEqual(expect.arrayContaining(["hard-win", "legend-win"]));
    expect(xpFor(match({ difficulty: "legend" }))).toBeGreaterThan(
      xpFor(match({ difficulty: "hard" })),
    );
  });

  it("rentetan kemenangan dan reset saat kalah", () => {
    let p = emptyProgress();
    for (let i = 0; i < 3; i++) p = applyMatch(p, match()).progress;
    expect(p.bestStreak).toBe(3);
    expect(p.achievements).toContain("streak-3");
    p = applyMatch(p, match({ won: false })).progress;
    expect(p.streak).toBe(0);
    expect(p.bestStreak).toBe(3);
  });

  it("data rusak dari localStorage dibersihkan", () => {
    const p = sanitizeProgress({ xp: -5, wins: "x", achievements: ["jackpot", "<script>"] });
    expect(p.xp).toBe(0);
    expect(p.wins).toBe(0);
    expect(p.achievements).toEqual(["jackpot"]);
    expect(sanitizeProgress(null)).toEqual(emptyProgress());
  });
});

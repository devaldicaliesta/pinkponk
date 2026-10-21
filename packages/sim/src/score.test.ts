import { describe, expect, it } from "vitest";
import { awardPoint, createScore, currentServer, gameWinner } from "./score";

const play = (pointsFor: (0 | 1)[], bestOf: 1 | 3 | 5 = 3) => {
  const s = createScore(bestOf, 0);
  for (const p of pointsFor) awardPoint(s, p);
  return s;
};

describe("skor", () => {
  it("game selesai di 11 dengan selisih 2", () => {
    const s = createScore(3, 0);
    s.points = [10, 9];
    expect(gameWinner(s)).toBeNull();
    s.points = [11, 9];
    expect(gameWinner(s)).toBe(0);
  });

  it("deuce butuh selisih 2", () => {
    const s = createScore(3, 0);
    s.points = [11, 10];
    expect(gameWinner(s)).toBeNull();
    s.points = [12, 10];
    expect(gameWinner(s)).toBe(0);
  });

  it("servis bergantian tiap 2 poin", () => {
    const s = createScore(3, 0);
    const servers: number[] = [];
    for (let i = 0; i < 6; i++) {
      servers.push(currentServer(s));
      s.points[(i % 2) as 0 | 1] += 1;
    }
    expect(servers).toEqual([0, 0, 1, 1, 0, 0]);
  });

  it("servis bergantian tiap poin saat deuce", () => {
    const s = createScore(3, 0);
    s.points = [10, 10];
    const a = currentServer(s);
    s.points = [11, 10];
    const b = currentServer(s);
    s.points = [11, 11];
    expect([a, b, currentServer(s)]).toEqual([0, 1, 0]);
  });

  it("game baru: skor direset dan server pertama bergantian", () => {
    const s = play(Array(11).fill(0));
    expect(s.games).toEqual([1, 0]);
    expect(s.points).toEqual([0, 0]);
    expect(s.gameFirstServer).toBe(1);
  });

  it("best of 3 selesai setelah 2 game", () => {
    const s = createScore(3, 0);
    let result = { gameWon: null as 0 | 1 | null, matchWon: null as 0 | 1 | null };
    for (let i = 0; i < 22; i++) result = awardPoint(s, 1);
    expect(result.matchWon).toBe(1);
    expect(s.games).toEqual([0, 2]);
  });

  it("best of 1 selesai setelah 1 game", () => {
    const s = createScore(1, 0);
    let won = null;
    for (let i = 0; i < 11; i++) won = awardPoint(s, 0).matchWon;
    expect(won).toBe(0);
  });
});

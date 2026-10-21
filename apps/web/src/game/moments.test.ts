import type { MatchEvent } from "@pinkponk/sim";
import { describe, expect, it } from "vitest";
import { MomentTracker } from "./moments";

const run = (events: MatchEvent[], points: [number, number] = [0, 0]) => {
  const t = new MomentTracker();
  return events.map((e) => t.feed(e, points)?.kind ?? null).filter((k) => k !== null);
};

const serve: MatchEvent[] = [
  { type: "hit", player: 0, shot: "serve", grade: null },
  { type: "bounce", side: 0, x: 0, z: 1 },
  { type: "bounce", side: 1, x: 0, z: -1 },
];

describe("momen", () => {
  it("bola menyentuh net lalu masuk", () => {
    expect(
      run([
        ...serve,
        { type: "hit", player: 1, shot: "drive", grade: null },
        { type: "net" },
        { type: "bounce", side: 0, x: 0.1, z: 0.3 },
      ]),
    ).toEqual(["netIn"]);
  });

  it("servis kena net bukan momen", () => {
    expect(
      run([
        { type: "hit", player: 0, shot: "serve", grade: null },
        { type: "bounce", side: 0, x: 0, z: 1 },
        { type: "net" },
        { type: "bounce", side: 1, x: 0, z: -0.3 },
      ]),
    ).toEqual([]);
  });

  it("edge ball hanya di sisi lawan", () => {
    expect(
      run([
        ...serve,
        { type: "hit", player: 1, shot: "drive", grade: null },
        { type: "bounce", side: 0, x: 0.75, z: 0.8 },
      ]),
    ).toEqual(["edge"]);
    expect(run([...serve.slice(0, 1), { type: "bounce", side: 0, x: 0.75, z: 1 }])).toEqual([]);
  });

  it("mengembalikan smash lawan", () => {
    expect(
      run([
        ...serve,
        { type: "hit", player: 1, shot: "smash", grade: null },
        { type: "bounce", side: 0, x: 0, z: 0.8 },
        { type: "hit", player: 0, shot: "block", grade: null },
      ]),
    ).toEqual(["save"]);
  });

  it("reli panjang tiap 10 pukulan", () => {
    const hits: MatchEvent[] = Array.from({ length: 20 }, (_, i) => ({
      type: "hit",
      player: i % 2 === 0 ? 0 : 1,
      shot: i === 0 ? "serve" : "drive",
      grade: null,
    }));
    expect(run(hits)).toEqual(["rally", "rally"]);
  });

  it("comeback setelah tertinggal 4 poin", () => {
    const t = new MomentTracker();
    t.feed({ type: "point", winner: 1, reason: "miss" }, [2, 6]);
    t.feed({ type: "point", winner: 0, reason: "miss" }, [11, 9]);
    expect(t.feed({ type: "game", winner: 0 }, [11, 9])).toMatchObject({
      kind: "comeback",
      player: 0,
    });
    t.feed({ type: "point", winner: 1, reason: "miss" }, [0, 3]);
    expect(t.feed({ type: "game", winner: 1 }, [5, 11])).toBeNull();
  });
});

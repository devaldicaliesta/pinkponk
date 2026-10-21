import { describe, expect, it } from "vitest";
import { badgeFor, countdownFor, serveHintFor } from "./hud-logic";
import { type MatchView, NO_GAMBLE } from "./session";

const view = (patch: Partial<MatchView>): MatchView => ({
  tick: 1000,
  phase: "rally",
  phaseTick: 900,
  server: 0,
  winner: null,
  points: [0, 0],
  games: [0, 0],
  fever: [false, false],
  rallyHits: 0,
  ball: { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } },
  bats: [0, 0],
  gamble: [NO_GAMBLE, NO_GAMBLE],
  ...patch,
});

describe("badge", () => {
  it("deuce saat 10-10 ke atas dan seri", () => {
    expect(badgeFor(view({ points: [10, 10] }), 3)).toBe("deuce");
    expect(badgeFor(view({ points: [13, 13] }), 3)).toBe("deuce");
    expect(badgeFor(view({ points: [5, 5] }), 3)).toBeNull();
  });

  it("game point dan match point", () => {
    expect(badgeFor(view({ points: [10, 7] }), 3)).toBe("gamePoint");
    expect(badgeFor(view({ points: [10, 7], games: [1, 0] }), 3)).toBe("matchPoint");
    expect(badgeFor(view({ points: [3, 10] }), 1)).toBe("matchPoint");
    expect(badgeFor(view({ points: [9, 7] }), 3)).toBeNull();
  });
});

describe("hitung mundur", () => {
  it("3-2-1 lalu Mulai", () => {
    expect(countdownFor(view({ phase: "countdown", tick: 10, phaseTick: 0 }))).toBe(3);
    expect(countdownFor(view({ phase: "countdown", tick: 300, phaseTick: 0 }))).toBe(1);
    expect(countdownFor(view({ phase: "serve", tick: 400, phaseTick: 380 }))).toBe(0);
    expect(
      countdownFor(view({ phase: "serve", tick: 400, phaseTick: 380, points: [1, 0] })),
    ).toBeNull();
  });
});

describe("petunjuk servis", () => {
  it("menyesuaikan perangkat dan giliran", () => {
    const serve = view({ phase: "serve", server: 0 });
    expect(serveHintFor("ai", 0, serve, true)).toBe("tap");
    expect(serveHintFor("ai", 0, serve, false)).toBe("key");
    expect(serveHintFor("online", 1, serve, true)).toBe("wait");
    expect(serveHintFor("local", null, view({ phase: "serve", server: 1 }), false)).toBe("p2");
    expect(serveHintFor("ai", 0, view({ phase: "rally" }), true)).toBeNull();
  });
});

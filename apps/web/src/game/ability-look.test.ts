import { describe, expect, it } from "vitest";
import { abilityLook, ballOpacity, turboTrail } from "./ability-look";
import { type MatchView, NO_GAMBLE } from "./session";

const view = (patch: Partial<MatchView> = {}): MatchView => ({
  tick: 0,
  phase: "rally",
  phaseTick: 0,
  server: 0,
  winner: null,
  points: [0, 0],
  games: [0, 0],
  fever: [false, false],
  rallyHits: 0,
  ball: { pos: { x: 0, y: 0.3, z: 0 }, vel: { x: 0, y: 0, z: -5 }, spin: { x: 0, y: 0, z: 0 } },
  bats: [0, 0],
  gamble: [NO_GAMBLE, NO_GAMBLE],
  ...patch,
});

const ghost0 = { ...NO_GAMBLE, ability: "ghost" as const, pointsLeft: 1 };

describe("tampilan kemampuan", () => {
  it("bat raksasa membesar, jinx mengecil, freeze lawan membekukan", () => {
    expect(abilityLook({ ...NO_GAMBLE, ability: "giant" }, NO_GAMBLE).batScale).toBeGreaterThan(1);
    expect(abilityLook({ ...NO_GAMBLE, ability: "jinx" }, NO_GAMBLE)).toMatchObject({
      aura: "bad",
    });
    expect(abilityLook(NO_GAMBLE, { ...NO_GAMBLE, ability: "freeze" }).frozen).toBe(true);
    expect(abilityLook(NO_GAMBLE, NO_GAMBLE)).toEqual({ batScale: 1, frozen: false, aura: null });
  });

  it("bola hantu hilang di tengah meja bagi lawan, samar bagi pemiliknya", () => {
    // Pemain 0 memukul: bola bergerak ke z negatif (menuju pemain 1).
    const v = view({ gamble: [ghost0, NO_GAMBLE] });
    expect(ballOpacity(v, 1)).toBeLessThan(0.1);
    expect(ballOpacity(v, 0)).toBeCloseTo(0.45);
    // Dekat ujung meja bola terlihat lagi.
    expect(
      ballOpacity(
        view({ gamble: [ghost0, NO_GAMBLE], ball: { ...v.ball, pos: { x: 0, y: 0.2, z: -1.3 } } }),
        1,
      ),
    ).toBe(1);
    // Bola menuju pemilik: tidak terpengaruh.
    expect(
      ballOpacity(
        view({ gamble: [ghost0, NO_GAMBLE], ball: { ...v.ball, vel: { x: 0, y: 0, z: 5 } } }),
        1,
      ),
    ).toBe(1);
  });

  it("jejak bola kilat hanya untuk pukulan pemiliknya", () => {
    const turbo1 = { ...NO_GAMBLE, ability: "turbo" as const };
    expect(turboTrail(view({ gamble: [NO_GAMBLE, turbo1] }))).toBe(false);
    expect(
      turboTrail(
        view({ gamble: [NO_GAMBLE, turbo1], ball: { ...view().ball, vel: { x: 0, y: 0, z: 5 } } }),
      ),
    ).toBe(true);
  });
});

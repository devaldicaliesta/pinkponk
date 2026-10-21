import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { classifySwing, NO_BOOST, swingShot } from "./shots";
import { vec } from "./vec";

describe("variasi pukulan ayunan", () => {
  it.each([
    [1, 0, 0.3, "smash"],
    [0.6, 0.9, 0.1, "loop"],
    [0.5, -0.9, 0.1, "chop"],
    [0.15, -0.6, 0.1, "drop"],
    [0.2, 0.9, 0.1, "lob"],
    [0.1, 0, 0.1, "block"],
    [0.6, 0.1, 0.1, "drive"],
  ] as const)("tenaga %f, spin %f, tinggi %f → %s", (power, lift, y, kind) => {
    expect(classifySwing(power, lift, y)).toBe(kind);
  });

  it("Mode Smash memicu smash dari tenaga dan bola lebih rendah", () => {
    expect(classifySwing(0.7, 0, 0.12)).toBe("drive");
    expect(classifySwing(0.7, 0, 0.12, true)).toBe("smash");
  });

  it.each(["smash", "loop", "chop", "drop", "lob", "block", "drive"] as const)(
    "%s dari posisi pukul biasa mendarat di meja lawan",
    (kind) => {
      const params = {
        smash: { power: 1, lift: 0 },
        loop: { power: 0.6, lift: 0.9 },
        chop: { power: 0.5, lift: -0.9 },
        drop: { power: 0.15, lift: -0.6 },
        lob: { power: 0.2, lift: 0.9 },
        block: { power: 0.1, lift: 0 },
        drive: { power: 0.6, lift: 0.1 },
      }[kind];
      let ok = 0;
      for (let s = 1; s <= 20; s++) {
        const shot = swingShot(
          vec(0.1, kind === "smash" ? 0.3 : 0.15, 1.6),
          0,
          { aim: 0, offset: 0, ...params },
          createRng(s),
        );
        expect(shot.kind).toBe(kind);
        // Pukulan lurus kena tengah bat hampir selalu masuk.
        if (shot.launch.vel.z < 0) ok++;
      }
      expect(ok).toBe(20);
    },
  );

  it("bola melengkung memberi sidespin penuh", () => {
    const shot = swingShot(
      vec(0, 0.15, 1.6),
      0,
      { aim: 0.5, lift: 0, power: 0.5, offset: 0 },
      createRng(1),
      { ...NO_BOOST, curve: true },
    );
    expect(shot.kind).toBe("curve");
    expect(Math.abs(shot.launch.spin.y)).toBeGreaterThan(50);
  });
});

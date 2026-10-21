import { describe, expect, it } from "vitest";
import { defaults, sanitizeSettings } from "./settings";

describe("sanitizeSettings", () => {
  it("data kosong atau rusak → bawaan", () => {
    expect(sanitizeSettings(null)).toEqual(defaults());
    expect(sanitizeSettings("rusak")).toEqual(defaults());
  });

  it("nilai tidak sah diganti bawaan, nilai sah dipertahankan", () => {
    const s = sanitizeSettings({
      theme: "neon",
      lang: "en",
      calibrationMs: 900,
      character: { frame: 99, armor: 2 },
      pov: "drone",
      stats: { wins: -5, perfects: 3 },
    });
    expect(s.theme).toBe("system");
    expect(s.lang).toBe("en");
    expect(s.calibrationMs).toBe(150);
    expect(s.character).toEqual({ frame: 5, armor: 2, visor: 0, bat: 0 });
    expect(s.pov).toBe("classic");
    expect(s.stats.wins).toBe(0);
    expect(s.stats.perfects).toBe(3);
  });
});

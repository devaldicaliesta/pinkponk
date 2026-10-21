export type TimingGrade = "perfect" | "great" | "good" | "early" | "late" | "miss";

export const TIMING_WINDOWS_MS = {
  perfect: 50,
  great: 100,
  good: 160,
  edge: 250,
} as const;

export const FEVER_STREAK = 3;
export const FEVER_MS = 8000;
export const RALLY_SPEEDUP_PER_HIT = 0.03;
export const RALLY_SPEEDUP_MAX = 0.35;
export const EDGE_FAIL_CHANCE = 0.4;

/** Nilai tap berdasarkan selisih (ms) terhadap waktu ideal; negatif = terlalu awal. */
export const gradeTiming = (deltaMs: number | null): TimingGrade => {
  if (deltaMs === null) return "miss";
  const d = Math.abs(deltaMs);
  if (d <= TIMING_WINDOWS_MS.perfect) return "perfect";
  if (d <= TIMING_WINDOWS_MS.great) return "great";
  if (d <= TIMING_WINDOWS_MS.good) return "good";
  if (d <= TIMING_WINDOWS_MS.edge) return deltaMs < 0 ? "early" : "late";
  return "miss";
};

export const rallySpeedFactor = (rallyHits: number): number =>
  1 + Math.min(RALLY_SPEEDUP_MAX, RALLY_SPEEDUP_PER_HIT * rallyHits);

export const isPerfect = (g: TimingGrade): boolean => g === "perfect";

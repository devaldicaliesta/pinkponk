import { BAT_MAX_X, clamp } from "@pinkponk/sim";

/** Sampel gerakan pointer dalam satuan lebar layar (x) dan tinggi layar (y). */
export interface PointerSample {
  t: number;
  x: number;
  y: number;
}

export interface SwingReading {
  aim: number;
  lift: number;
  power: number;
}

const WINDOW_MS = 120;

/** Lebar layar penuh dipetakan ke rentang gerak bat ±1 m. */
export const screenToBatX = (nx: number): number => clamp((nx - 0.5) * 2, -BAT_MAX_X, BAT_MAX_X);

/**
 * Ubah gerakan pointer 120 ms terakhir menjadi parameter ayunan.
 * Kecepatan dalam layar/detik: 2,5 layar/detik = tenaga penuh.
 */
export const readSwing = (
  samples: readonly PointerSample[],
  now: number,
  held: boolean,
): SwingReading => {
  const recent = samples.filter((s) => now - s.t <= WINDOW_MS);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.t === first.t) {
    return { aim: 0, lift: 0, power: held ? 0.4 : 0.25 };
  }
  const dt = (last.t - first.t) / 1000;
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  const speed = Math.hypot(vx, vy);
  return {
    aim: clamp(vx / 1.5, -1, 1),
    // Layar: y bertambah ke bawah, jadi gerakan ke atas (vy < 0) = topspin.
    lift: clamp(-vy / 1.5, -1, 1),
    power: clamp(0.25 + speed / 2.5 + (held ? 0.15 : 0), 0, 1),
  };
};

/** Arah tap di mode timing: kiri/tengah/kanan layar. */
export const tapAim = (nx: number): number => clamp((nx - 0.5) * 2.4, -1, 1);

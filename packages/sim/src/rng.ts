// PRNG mulberry32. State berupa satu bilangan agar mudah disalin dan dikirim.
export interface Rng {
  state: number;
}

export const createRng = (seed: number): Rng => ({ state: seed >>> 0 });

export const nextFloat = (rng: Rng): number => {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const range = (rng: Rng, min: number, max: number): number =>
  min + (max - min) * nextFloat(rng);

// Distribusi Irwin-Hall (4 sampel) sebagai pendekatan normal tanpa log/cos,
// supaya hasilnya identik di semua mesin JavaScript.
export const gaussian = (rng: Rng, sigma: number): number => {
  const sum = nextFloat(rng) + nextFloat(rng) + nextFloat(rng) + nextFloat(rng);
  return (sum - 2) * Math.sqrt(3) * sigma;
};

export const chance = (rng: Rng, p: number): boolean => nextFloat(rng) < p;

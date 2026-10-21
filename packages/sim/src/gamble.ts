import { nextFloat, type Rng } from "./rng";

// Urutan daftar ini dipakai protokol jaringan: hanya boleh ditambah di akhir.
export const ABILITIES = [
  "giant",
  "turbo",
  "double",
  "shield",
  "magnet",
  "freeze",
  "ghost",
  "jinx",
  "jackpot",
  "curve",
  "slowmo",
  "steal",
  "smasher",
] as const;
export type Ability = (typeof ABILITIES)[number];

// Stack hanya terisi dari pukulan PERFECT (timing tepat atau kena titik manis bat), jadi
// kemampuan adalah hadiah untuk bermain bagus, bukan sekadar lama bermain.
export const STACK_MAX = 5;
export const STACK_PER_PERFECT = 1;
/** Kemampuan "Curi": jumlah stack lawan maksimal yang diambil. */
export const STEAL_MAX = 3;

interface Slice {
  ability: Ability;
  weight: number;
  /** Berlaku untuk sekian poin berikutnya. */
  points: readonly [number, number];
}

// Roulette: sebagian besar menguntungkan, tetapi ada risiko "jinx" yang merugikan
// pemakainya sendiri. Itulah unsur gamble-nya.
export const ROULETTE: readonly Slice[] = [
  { ability: "giant", weight: 11, points: [1, 2] },
  { ability: "turbo", weight: 10, points: [1, 2] },
  { ability: "double", weight: 9, points: [1, 1] },
  { ability: "shield", weight: 9, points: [1, 2] },
  { ability: "magnet", weight: 9, points: [1, 2] },
  { ability: "freeze", weight: 8, points: [1, 2] },
  { ability: "ghost", weight: 8, points: [1, 2] },
  { ability: "curve", weight: 9, points: [1, 2] },
  { ability: "slowmo", weight: 8, points: [1, 2] },
  { ability: "smasher", weight: 6, points: [1, 2] },
  { ability: "steal", weight: 3, points: [1, 1] },
  { ability: "jinx", weight: 7, points: [1, 1] },
  { ability: "jackpot", weight: 3, points: [1, 1] },
];

const TOTAL_WEIGHT = ROULETTE.reduce((s, r) => s + r.weight, 0);

export interface GambleState {
  stack: number;
  ability: Ability | null;
  pointsLeft: number;
  /** Perisai hanya menyelamatkan sekali per poin. */
  shieldUsed: boolean;
  /** Tombol ditekan saat reli: kemampuan dipakai begitu poin berikutnya dimulai. */
  armed: boolean;
}

export const createGamble = (): GambleState => ({
  stack: 0,
  ability: null,
  pointsLeft: 0,
  shieldUsed: false,
  armed: false,
});

export const canActivate = (g: GambleState): boolean => g.stack >= STACK_MAX && g.ability === null;

export const rollAbility = (rng: Rng): { ability: Ability; points: number } => {
  let r = nextFloat(rng) * TOTAL_WEIGHT;
  let pick = ROULETTE[ROULETTE.length - 1]!;
  for (const slice of ROULETTE) {
    if (r < slice.weight) {
      pick = slice;
      break;
    }
    r -= slice.weight;
  }
  const [min, max] = pick.points;
  const points = min + Math.floor(nextFloat(rng) * (max - min + 1));
  return { ability: pick.ability, points };
};

export const addStack = (g: GambleState, amount: number): void => {
  g.stack = Math.min(STACK_MAX, g.stack + amount);
};

/** Pengali yang berlaku untuk seorang pemain, dari kemampuannya sendiri dan lawan. */
export interface Mods {
  reach: number;
  batSpeed: number;
  shotSpeed: number;
  sigma: number;
  pointValue: number;
  shield: boolean;
  /** Pengali lebar jendela timing (mode Timing Smash, bat bergerak sendiri). */
  timingWindow: number;
  /** Pukulan melengkung dengan sidespin penuh. */
  curve: boolean;
  /** Smash lebih mudah dipicu (dan GREAT menjadi smash di Timing Smash). */
  easySmash: boolean;
  /** Bola yang menyeberang net menuju pemain ini melambat. */
  slowIncoming: boolean;
}

export const NO_MODS: Readonly<Mods> = Object.freeze({
  reach: 1,
  batSpeed: 1,
  shotSpeed: 1,
  sigma: 1,
  pointValue: 1,
  shield: false,
  timingWindow: 1,
  curve: false,
  easySmash: false,
  slowIncoming: false,
});

export const modsFor = (mine: GambleState, theirs: GambleState): Mods => {
  const m: Mods = { ...NO_MODS };
  switch (mine.ability) {
    case "giant":
      m.reach = 1.6;
      m.timingWindow = 1.5;
      break;
    case "turbo":
      m.shotSpeed = 1.25;
      break;
    case "double":
      m.pointValue = 2;
      break;
    case "shield":
      m.shield = !mine.shieldUsed;
      break;
    case "magnet":
      m.batSpeed = 1.6;
      m.sigma = 0.6;
      m.timingWindow = 1.25;
      break;
    case "jinx":
      m.reach = 0.65;
      m.sigma = 1.4;
      m.timingWindow = 0.65;
      break;
    case "jackpot":
      m.reach = 1.6;
      m.pointValue = 2;
      m.timingWindow = 1.5;
      break;
    case "curve":
      m.curve = true;
      break;
    case "slowmo":
      m.slowIncoming = true;
      break;
    case "smasher":
      m.easySmash = true;
      break;
    default:
      break;
  }
  if (theirs.ability === "freeze") {
    m.batSpeed *= 0.55;
    m.timingWindow *= 0.75;
  }
  return m;
};

/** Satu poin selesai: kurangi sisa durasi kemampuan aktif. */
export const tickPoint = (g: GambleState): boolean => {
  g.shieldUsed = false;
  if (g.ability === null) return false;
  g.pointsLeft -= 1;
  if (g.pointsLeft > 0) return false;
  g.ability = null;
  g.pointsLeft = 0;
  return true;
};

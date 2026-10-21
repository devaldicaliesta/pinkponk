import { useEffect, useState } from "preact/hooks";
import { readJson, writeJson, writeRaw } from "./storage";

export type Theme = "system" | "dark" | "light";
export type Lang = "id" | "en";
export type Graphics = "auto" | "high" | "low";
export type Motion = "system" | "reduced" | "full";
export type Pov = "classic" | "first" | "tv" | "iso";

export interface CharacterLook {
  frame: number;
  armor: number;
  visor: number;
  bat: number;
}

export interface Stats {
  wins: number;
  losses: number;
  longestRally: number;
  perfects: number;
  timingHits: number;
}

export interface Settings {
  nickname: string | null;
  theme: Theme;
  lang: Lang;
  sound: boolean;
  haptics: boolean;
  graphics: Graphics;
  motion: Motion;
  colorblind: boolean;
  pov: Pov | null;
  calibrationMs: number;
  character: CharacterLook;
  tutorialDone: boolean;
  stats: Stats;
}

const KEY = "pp.settings";
const THEME_KEY = "pp.theme";

const defaultLang = (): Lang => {
  try {
    return navigator.language.toLowerCase().startsWith("en") ? "en" : "id";
  } catch {
    return "id";
  }
};

export const defaults = (): Settings => ({
  nickname: null,
  theme: "system",
  lang: defaultLang(),
  sound: true,
  haptics: true,
  graphics: "auto",
  motion: "system",
  colorblind: false,
  pov: null,
  calibrationMs: 0,
  character: { frame: 0, armor: 0, visor: 0, bat: 0 },
  tutorialDone: false,
  stats: { wins: 0, losses: 0, longestRally: 0, perfects: 0, timingHits: 0 },
});

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Data dari localStorage bisa rusak atau dari versi lama; ambil yang sah saja. */
export const sanitizeSettings = (raw: unknown): Settings => {
  const d = defaults();
  if (typeof raw !== "object" || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const ch = (r.character ?? {}) as Record<string, unknown>;
  const st = (r.stats ?? {}) as Record<string, unknown>;
  return {
    nickname: typeof r.nickname === "string" ? r.nickname : null,
    theme: oneOf(r.theme, ["system", "dark", "light"], d.theme),
    lang: oneOf(r.lang, ["id", "en"], d.lang),
    sound: typeof r.sound === "boolean" ? r.sound : d.sound,
    haptics: typeof r.haptics === "boolean" ? r.haptics : d.haptics,
    graphics: oneOf(r.graphics, ["auto", "high", "low"], d.graphics),
    motion: oneOf(r.motion, ["system", "reduced", "full"], d.motion),
    colorblind: r.colorblind === true,
    pov: r.pov === null ? null : oneOf<Pov>(r.pov, ["classic", "first", "tv", "iso"], "classic"),
    calibrationMs: num(r.calibrationMs, 0, -150, 150),
    character: {
      frame: num(ch.frame, 0, 0, 5),
      armor: num(ch.armor, 0, 0, 5),
      visor: num(ch.visor, 0, 0, 5),
      bat: num(ch.bat, 0, 0, 3),
    },
    tutorialDone: r.tutorialDone === true,
    stats: {
      wins: num(st.wins, 0, 0, 1e9),
      losses: num(st.losses, 0, 0, 1e9),
      longestRally: num(st.longestRally, 0, 0, 1e6),
      perfects: num(st.perfects, 0, 0, 1e9),
      timingHits: num(st.timingHits, 0, 0, 1e9),
    },
  };
};

let current: Settings = sanitizeSettings(readJson(KEY));
const listeners = new Set<(s: Settings) => void>();

const applyToDocument = (s: Settings): void => {
  const root = document.documentElement;
  if (s.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.lang = s.lang;
  root.dataset.graphics = s.graphics;
  if (s.motion === "system") delete root.dataset.motion;
  else root.dataset.motion = s.motion;
  root.dataset.colorblind = s.colorblind ? "on" : "off";
};

export const getSettings = (): Settings => current;

export const updateSettings = (patch: Partial<Settings>): void => {
  current = { ...current, ...patch };
  writeJson(KEY, current);
  writeRaw(THEME_KEY, current.theme === "system" ? null : current.theme);
  applyToDocument(current);
  for (const l of listeners) l(current);
};

export const initSettings = (): void => applyToDocument(current);

export const useSettings = (): Settings => {
  const [s, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    return () => {
      listeners.delete(set);
    };
  }, []);
  return s;
};

export const prefersReducedMotion = (s: Settings): boolean => {
  if (s.motion !== "system") return s.motion === "reduced";
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export const isDarkTheme = (s: Settings): boolean => {
  if (s.theme !== "system") return s.theme === "dark";
  try {
    return !matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return true;
  }
};

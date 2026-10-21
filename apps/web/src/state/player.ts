import { readJson, writeJson } from "./storage";

// Identitas pemain untuk leaderboard global: rahasia acak 32 byte yang hanya ada di
// perangkat ini. Server menyimpan hash-nya saja, jadi orang lain tidak bisa memakai
// nama/peringkat kita tanpa rahasia ini. Hapus data situs = identitas baru.
const KEY = "pp.player";

const randomHex = (bytes: number): string =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

let cached: string | null = null;

export const playerSecret = (): string => {
  if (cached) return cached;
  const saved = readJson<{ s?: unknown }>(KEY);
  if (typeof saved?.s === "string" && /^[0-9a-f]{64}$/.test(saved.s)) {
    cached = saved.s;
    return cached;
  }
  cached = randomHex(32);
  writeJson(KEY, { s: cached });
  return cached;
};

/** ID publik = 128 bit pertama SHA-256; rumus sama dengan server (leaderboard-core.ts). */
export const playerId = async (): Promise<string> => {
  const data = new TextEncoder().encode(`pinkponk-player:${playerSecret()}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

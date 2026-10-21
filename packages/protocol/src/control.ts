import type { BestOf, PlayMode, Side } from "@pinkponk/sim";

export interface RoomConfig {
  mode: PlayMode;
  bestOf: BestOf;
  gamble: boolean;
}

/**
 * Versi protokol. Naikkan setiap format pesan berubah: client lama (misalnya dari cache
 * service worker) ditolak dengan kode "outdated" dan diminta memuat ulang.
 */
export const PROTOCOL_VERSION = 2;

export const EMOJIS = ["👍", "🔥", "😂", "😮", "😤", "👏"] as const;

export type ClientControl =
  | {
      t: "hello";
      v: number;
      nick: string;
      create: boolean;
      config: RoomConfig;
      token: string | null;
      /** Bukti identitas pemain untuk leaderboard (hex 64), opsional. */
      player: string | null;
    }
  | { t: "rematch" }
  | { t: "pause" }
  | { t: "resume" }
  | { t: "emoji"; e: number };

export type RoomErrorCode =
  | "not-found"
  | "full"
  | "bad-nickname"
  | "rate-limited"
  | "bad-message"
  | "outdated"
  | "busy"
  | "idle";

export type ServerControl =
  | { t: "welcome"; you: Side; code: string; token: string }
  | { t: "lobby"; players: [string | null, string | null]; config: RoomConfig }
  | { t: "start"; config: RoomConfig; players: [string, string] }
  | {
      t: "paused";
      player: Side;
      reason: PauseReason;
      resumeBy: number;
      pausesLeft: [number, number];
    }
  | { t: "resumed" }
  | { t: "left"; player: Side }
  | { t: "rematch"; player: Side }
  | { t: "emoji"; player: Side; e: number }
  | { t: "error"; code: RoomErrorCode };

export type PauseReason = "disconnect" | "request";

/** Jeda atas permintaan pemain online: jumlah per pemain per pertandingan dan lamanya. */
export const PAUSES_PER_MATCH = 2;
export const PAUSE_MAX_MS = 60_000;

export const MAX_CONTROL_LENGTH = 320;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const parseConfig = (v: unknown): RoomConfig | null => {
  if (!isRecord(v)) return null;
  const mode = v.mode === "swing" || v.mode === "timing" ? v.mode : null;
  const bestOf = v.bestOf === 1 || v.bestOf === 3 || v.bestOf === 5 ? v.bestOf : null;
  return mode && bestOf ? { mode, bestOf, gamble: v.gamble === true } : null;
};

/** Validasi pesan kontrol dari client. Pesan yang tidak dikenal ditolak (null). */
export const parseClientControl = (text: string): ClientControl | null => {
  if (text.length > MAX_CONTROL_LENGTH) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data.t) {
    case "hello": {
      const config = parseConfig(data.config);
      if (typeof data.nick !== "string" || typeof data.create !== "boolean" || !config) return null;
      const token =
        typeof data.token === "string" && /^[0-9a-f]{32}$/.test(data.token) ? data.token : null;
      const player =
        typeof data.player === "string" && isPlayerSecret(data.player) ? data.player : null;
      const v = typeof data.v === "number" && Number.isInteger(data.v) ? data.v : 0;
      return { t: "hello", v, nick: data.nick, create: data.create, config, token, player };
    }
    case "rematch":
    case "pause":
    case "resume":
      return { t: data.t };
    case "emoji":
      return typeof data.e === "number" &&
        Number.isInteger(data.e) &&
        data.e >= 0 &&
        data.e < EMOJIS.length
        ? { t: "emoji", e: data.e }
        : null;
    default:
      return null;
  }
};

export const parseServerControl = (text: string): ServerControl | null => {
  try {
    const data: unknown = JSON.parse(text);
    return isRecord(data) && typeof data.t === "string" ? (data as ServerControl) : null;
  } catch {
    return null;
  }
};

/** Rahasia pemain: 32 byte acak dalam hex, dibuat di perangkat dan tidak pernah ditampilkan. */
export const isPlayerSecret = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export const isRoomCode = (s: string): boolean =>
  s.length === ROOM_CODE_LENGTH && [...s].every((c) => CODE_ALPHABET.includes(c));

/** Kode room dari byte acak (crypto); 31 simbol tanpa I, L, O, 0, 1. */
export const roomCodeFromBytes = (bytes: Uint8Array): string => {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
  }
  return code;
};

export const ANALYTICS_EVENTS = ["match_start", "match_end", "room_done", "js_error"] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

// ---- Antrean cari lawan acak (/ws/queue) ----

export type QueueClient = { t: "queue"; v: number; mode: PlayMode; gamble: boolean };

export type QueueServer =
  | { t: "queued"; waiting: number }
  | { t: "matched"; code: string }
  | { t: "timeout" }
  | { t: "error"; code: "outdated" | "busy" | "bad-message" | "rate-limited" };

/** Lama menunggu lawan sebelum antrean dibatalkan. */
export const QUEUE_TIMEOUT_MS = 60_000;
/** Pertandingan dari antrean selalu best of 3. */
export const QUEUE_BEST_OF = 3;

export const parseQueueClient = (text: string): QueueClient | null => {
  if (text.length > MAX_CONTROL_LENGTH) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (!isRecord(data) || data.t !== "queue") return null;
    const mode = data.mode === "swing" || data.mode === "timing" ? data.mode : null;
    const v = typeof data.v === "number" && Number.isInteger(data.v) ? data.v : 0;
    return mode ? { t: "queue", v, mode, gamble: data.gamble === true } : null;
  } catch {
    return null;
  }
};

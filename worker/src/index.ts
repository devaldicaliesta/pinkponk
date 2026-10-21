import { isRoomCode, roomCodeFromBytes } from "@pinkponk/protocol";
import type { Env } from "./env";
import {
  errorResponse,
  isAllowedOrigin,
  json,
  MAX_EVENT_BODY,
  parseEventPayload,
  parseOrigins,
  SECURITY_HEADERS,
} from "./http";

import { isPlayerId } from "./leaderboard-core";

export { Leaderboard } from "./leaderboard";
export { Matchmaker } from "./matchmaker";
export { Room } from "./room";

const LEADERBOARD_CACHE_S = 30;

const clientKey = (request: Request): string =>
  request.headers.get("CF-Connecting-IP") ?? "unknown";

const limited = async (limiter: RateLimit | undefined, request: Request): Promise<boolean> => {
  if (!limiter) return false;
  const { success } = await limiter.limit({ key: clientKey(request) });
  return !success;
};

const createRoom = async (request: Request, env: Env): Promise<Response> => {
  if (await limited(env.RL_ROOM, request)) return errorResponse(429, "rate-limited");
  const code = roomCodeFromBytes(crypto.getRandomValues(new Uint8Array(6)));
  return json({ code });
};

const joinRoom = async (request: Request, env: Env, code: string): Promise<Response> => {
  if (request.headers.get("Upgrade") !== "websocket") return errorResponse(426, "upgrade-required");
  if (!isRoomCode(code)) return errorResponse(404, "not-found");
  if (await limited(env.RL_JOIN, request)) return errorResponse(429, "rate-limited");
  // Room dibuat di wilayah Asia-Pasifik (termasuk Singapura) agar dekat pemain Indonesia.
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code), { locationHint: "apac" });
  return stub.fetch(request);
};

const joinQueue = async (request: Request, env: Env): Promise<Response> => {
  if (request.headers.get("Upgrade") !== "websocket") return errorResponse(426, "upgrade-required");
  if (await limited(env.RL_JOIN, request)) return errorResponse(429, "rate-limited");
  const stub = env.MATCHMAKER.get(env.MATCHMAKER.idFromName("global"), { locationHint: "apac" });
  return stub.fetch(request);
};

const leaderboardStub = (env: Env) =>
  env.LEADERBOARD.get(env.LEADERBOARD.idFromName("global"), { locationHint: "apac" });

/**
 * Papan peringkat publik. Disimpan di cache edge sebentar supaya lonjakan pembaca (atau uji
 * beban) tidak semuanya sampai ke satu Durable Object.
 */
// Satu isolate melayani banyak permintaan: simpan hasil top-50 sebentar di memori dan
// gabungkan permintaan yang datang bersamaan menjadi satu panggilan ke Durable Object.
let topMemo: { body: string; at: number } | null = null;
let topInflight: Promise<string> | null = null;

const loadTop = (env: Env): Promise<string> => {
  if (topMemo && Date.now() - topMemo.at < LEADERBOARD_CACHE_S * 1000) {
    return Promise.resolve(topMemo.body);
  }
  topInflight ??= leaderboardStub(env)
    .top()
    .then((top) => {
      const body = JSON.stringify({ top, at: Date.now() });
      topMemo = { body, at: Date.now() };
      return body;
    })
    .finally(() => {
      topInflight = null;
    });
  return topInflight;
};

const leaderboardTop = async (request: Request, env: Env, ctx: ExecutionContext) => {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(new URL("/api/leaderboard", request.url).toString());
  const hit = await cache?.match(key);
  if (hit) return hit;
  if (await limited(env.RL_LB, request)) return errorResponse(429, "rate-limited");
  const res = new Response(await loadTop(env), {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${LEADERBOARD_CACHE_S}`,
    },
  });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
};

const leaderboardMe = async (request: Request, env: Env, id: string) => {
  if (!isPlayerId(id)) return errorResponse(400, "bad-id");
  if (await limited(env.RL_LB, request)) return errorResponse(429, "rate-limited");
  return json({ me: await leaderboardStub(env).me(id) });
};

const recordEvent = async (request: Request, env: Env): Promise<Response> => {
  if (await limited(env.RL_EVENT, request)) return errorResponse(429, "rate-limited");
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > MAX_EVENT_BODY) return errorResponse(413, "too-large");
  const payload = parseEventPayload(await request.text());
  if (!payload) return errorResponse(400, "bad-event");
  env.EVENTS?.writeDataPoint({
    blobs: [payload.e, payload.mode],
    doubles: [1],
    indexes: [payload.e],
  });
  return new Response(null, { status: 204 });
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const isApi = path.startsWith("/api/") || path.startsWith("/ws/");
    if (!isApi) return env.ASSETS.fetch(request);
    const origins = parseOrigins(env.ALLOWED_ORIGINS);
    // Data peringkat bersifat publik dan hanya-baca: GET same-origin dari browser tidak
    // membawa header Origin, jadi cukup tolak bila Origin ada dan bukan milik kita.
    if (path.startsWith("/api/leaderboard") && request.method === "GET") {
      const origin = request.headers.get("Origin");
      if (origin !== null && !origins.includes(origin))
        return errorResponse(403, "forbidden-origin");
      if (path === "/api/leaderboard") return leaderboardTop(request, env, ctx);
      if (path === "/api/leaderboard/me")
        return leaderboardMe(request, env, url.searchParams.get("id") ?? "");
      return errorResponse(404, "not-found");
    }
    if (!isAllowedOrigin(request, origins)) {
      return errorResponse(403, "forbidden-origin");
    }
    if (path === "/api/room" && request.method === "POST") return createRoom(request, env);
    if (path === "/api/event" && request.method === "POST") return recordEvent(request, env);
    if (path === "/ws/queue" && request.method === "GET") return joinQueue(request, env);
    const ws = path.match(/^\/ws\/room\/([A-Z0-9]{6})$/);
    if (ws?.[1] && request.method === "GET") return joinRoom(request, env, ws[1]);
    return errorResponse(404, "not-found");
  },
} satisfies ExportedHandler<Env>;

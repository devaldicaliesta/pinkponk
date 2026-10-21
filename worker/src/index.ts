import { isRoomCode, roomCodeFromBytes } from "@pinkponk/protocol";
import type { Env } from "./env";
import {
  errorResponse,
  isAllowedOrigin,
  json,
  MAX_EVENT_BODY,
  parseEventPayload,
  parseOrigins,
} from "./http";

export { Room } from "./room";

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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const isApi = path.startsWith("/api/") || path.startsWith("/ws/");
    if (!isApi) return env.ASSETS.fetch(request);
    if (!isAllowedOrigin(request, parseOrigins(env.ALLOWED_ORIGINS))) {
      return errorResponse(403, "forbidden-origin");
    }
    if (path === "/api/room" && request.method === "POST") return createRoom(request, env);
    if (path === "/api/event" && request.method === "POST") return recordEvent(request, env);
    const ws = path.match(/^\/ws\/room\/([A-Z0-9]{6})$/);
    if (ws?.[1] && request.method === "GET") return joinRoom(request, env, ws[1]);
    return errorResponse(404, "not-found");
  },
} satisfies ExportedHandler<Env>;

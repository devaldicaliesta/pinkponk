import { ANALYTICS_EVENTS, type AnalyticsEvent } from "@pinkponk/protocol";

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cache-Control": "no-store",
};

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });

export const errorResponse = (status: number, code: string): Response =>
  json({ error: code }, status);

export const parseOrigins = (raw: string): string[] =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Permintaan tanpa header Origin ditolak; browser selalu mengirimnya untuk POST dan WebSocket. */
export const isAllowedOrigin = (request: Request, allowed: string[]): boolean => {
  const origin = request.headers.get("Origin");
  return origin !== null && allowed.includes(origin);
};

export const MAX_EVENT_BODY = 512;
const MODES = ["swing", "timing", "local", "ai"] as const;

export interface EventPayload {
  e: AnalyticsEvent;
  mode: (typeof MODES)[number] | "none";
}

/** Hanya hitungan anonim dari daftar tetap; tidak ada nickname, IP, atau teks bebas. */
export const parseEventPayload = (text: string): EventPayload | null => {
  if (text.length > MAX_EVENT_BODY) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== "object" || data === null) return null;
    const { e, mode } = data as Record<string, unknown>;
    if (!ANALYTICS_EVENTS.includes(e as AnalyticsEvent)) return null;
    const m = MODES.includes(mode as (typeof MODES)[number])
      ? (mode as EventPayload["mode"])
      : "none";
    return { e: e as AnalyticsEvent, mode: m };
  } catch {
    return null;
  }
};

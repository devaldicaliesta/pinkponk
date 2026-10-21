import { PROTOCOL_VERSION, type QueueServer } from "@pinkponk/protocol";
import type { PlayMode } from "@pinkponk/sim";

export type QueueResult =
  | { kind: "matched"; code: string }
  | { kind: "timeout" }
  | { kind: "error"; code: "outdated" | "busy" | "bad-message" | "rate-limited" | "network" };

const parse = (text: string): QueueServer | null => {
  try {
    const data = JSON.parse(text) as { t?: unknown };
    return typeof data?.t === "string" ? (data as QueueServer) : null;
  } catch {
    return null;
  }
};

/** Antre mencari lawan acak. `onWaiting` dipanggil saat sudah masuk antrean. */
export const findOpponent = (
  mode: PlayMode,
  gamble: boolean,
  onWaiting: () => void,
): { result: Promise<QueueResult>; cancel(): void } => {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws/queue`);
  let settled = false;
  let resolveFn: (r: QueueResult) => void = () => {};
  const result = new Promise<QueueResult>((resolve) => {
    resolveFn = resolve;
  });
  const done = (r: QueueResult) => {
    if (settled) return;
    settled = true;
    resolveFn(r);
    try {
      ws.close(1000, "done");
    } catch {
      // Socket sudah tertutup.
    }
  };
  ws.onopen = () => ws.send(JSON.stringify({ t: "queue", v: PROTOCOL_VERSION, mode, gamble }));
  ws.onmessage = (e) => {
    const msg = typeof e.data === "string" ? parse(e.data) : null;
    if (!msg) return;
    if (msg.t === "queued") onWaiting();
    else if (msg.t === "matched") done({ kind: "matched", code: msg.code });
    else if (msg.t === "timeout") done({ kind: "timeout" });
    else if (msg.t === "error") done({ kind: "error", code: msg.code });
  };
  ws.onclose = () => done({ kind: "error", code: "network" });
  return { result, cancel: () => done({ kind: "timeout" }) };
};

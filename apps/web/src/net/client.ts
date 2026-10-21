import {
  decodePong,
  decodeSnapshot,
  encodeInput,
  encodePing,
  MSG_PONG,
  MSG_SNAPSHOT,
  messageType,
  PROTOCOL_VERSION,
  parseServerControl,
  type RoomConfig,
  type RoomErrorCode,
  type ServerControl,
  type Snapshot,
} from "@pinkponk/protocol";
import type { PlayerInput } from "@pinkponk/sim";
import { playerSecret } from "../state/player";
import { ClockSync } from "./clock";

export type NetError = RoomErrorCode | "network";

export interface NetHandlers {
  onControl(msg: ServerControl): void;
  onSnapshot(s: Snapshot): void;
  onClose(error: NetError | null): void;
}

const TOKEN_KEY = "pp.roomToken";
// Server menjawab ping tiap 2 detik; diam lebih lama dari ini berarti koneksi mati
// walau browser belum menyadarinya (misalnya HP berpindah jaringan).
const SILENCE_LIMIT_MS = 4500;

export const createRoom = async (): Promise<string> => {
  const res = await fetch("/api/room", { method: "POST" });
  if (res.status === 429) throw new Error("rate-limited");
  if (!res.ok) throw new Error("network");
  const data = (await res.json()) as { code?: unknown };
  if (typeof data.code !== "string") throw new Error("network");
  return data.code;
};

const loadToken = (code: string): string | null => {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as { code: string; token: string }) : null;
    return parsed?.code === code ? parsed.token : null;
  } catch {
    return null;
  }
};

const saveToken = (code: string, token: string): void => {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ code, token }));
  } catch {
    // Tanpa token, sambung ulang setelah reload tidak bisa kembali ke kursi lama.
  }
};

/** Koneksi WebSocket ke satu room, termasuk ping berkala dan sambung ulang otomatis. */
export class NetClient {
  readonly clock = new ClockSync();
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;
  private retries = 0;
  private welcomed = false;
  private lastMessageAt = 0;

  constructor(
    readonly code: string,
    private readonly nick: string,
    private readonly create: boolean,
    private readonly config: RoomConfig,
    private handlers: NetHandlers,
  ) {}

  /** Lobby menyerahkan koneksi ke sesi permainan saat pertandingan dimulai. */
  setHandlers(handlers: NetHandlers): void {
    this.handlers = handlers;
  }

  connect(): void {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/room/${this.code}`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.lastMessageAt = performance.now();
      ws.send(
        JSON.stringify({
          t: "hello",
          v: PROTOCOL_VERSION,
          player: playerSecret(),
          nick: this.nick,
          create: this.create && !this.welcomed,
          config: this.config,
          token: loadToken(this.code),
        }),
      );
      this.startPing();
    };
    ws.onmessage = (e) => this.onMessage(e.data as string | ArrayBuffer);
    ws.onclose = (e) => this.onClosed(e.code, e.reason);
  }

  sendInput(input: PlayerInput): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeInput(input));
  }

  sendControl(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUser = true;
    this.stopPing();
    this.ws?.close(1000, "bye");
  }

  private onMessage(data: string | ArrayBuffer): void {
    this.lastMessageAt = performance.now();
    if (typeof data === "string") {
      const msg = parseServerControl(data);
      if (!msg) return;
      if (msg.t === "welcome") {
        this.welcomed = true;
        saveToken(this.code, msg.token);
      }
      this.handlers.onControl(msg);
      return;
    }
    const type = messageType(data);
    if (type === MSG_SNAPSHOT) {
      const s = decodeSnapshot(data);
      if (s) this.handlers.onSnapshot(s);
    } else if (type === MSG_PONG) {
      const p = decodePong(data);
      if (p) this.clock.add(p.clientMs, p.serverMs, performance.now());
    }
  }

  private onClosed(code: number, reason: string): void {
    this.stopPing();
    if (this.closedByUser) return;
    if (code === 1008) {
      this.handlers.onClose((reason as RoomErrorCode) || "bad-message");
      return;
    }
    // Putus jaringan atau server restart: coba sambung ulang dengan token yang sama.
    if (this.welcomed && this.retries < 6) {
      this.retries += 1;
      this.handlers.onClose(null);
      setTimeout(() => this.connect(), 500 * 2 ** (this.retries - 1));
      return;
    }
    this.handlers.onClose("network");
  }

  private startPing(): void {
    this.stopPing();
    let count = 0;
    const ping = () => {
      const ws = this.ws;
      if (ws?.readyState === WebSocket.OPEN) {
        if (performance.now() - this.lastMessageAt > SILENCE_LIMIT_MS) {
          this.abandon(ws);
          return;
        }
        ws.send(encodePing(performance.now()));
      }
      count += 1;
      // Ping rapat di awal untuk sinkronisasi cepat, lalu tiap 2 detik.
      if (count === 5 && this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(ping, 2000);
      }
    };
    ping();
    this.pingTimer = setInterval(ping, 250);
  }

  /** Tinggalkan socket yang tidak lagi menjawab dan mulai sambung ulang. */
  private abandon(ws: WebSocket): void {
    ws.onclose = null;
    ws.onmessage = null;
    try {
      ws.close();
    } catch {
      // Socket sudah tidak bisa ditutup dengan rapi.
    }
    this.onClosed(1006, "");
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}

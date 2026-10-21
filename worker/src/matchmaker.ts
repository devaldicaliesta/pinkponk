import { DurableObject } from "cloudflare:workers";
import { roomCodeFromBytes } from "@pinkponk/protocol";
import type { Env } from "./env";
import { MAX_QUEUE, MatchmakerCore, QUEUE_HELLO_TIMEOUT_MS, type Ticket } from "./matchmaker-core";

const MAX_MESSAGES_PER_SOCKET = 3;

interface Attachment {
  id: string;
  ticket: Ticket | null;
}

const randomId = (): string =>
  [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/**
 * Satu instance global untuk antrean "cari lawan acak". Antrean hanya di memori (tidak
 * disimpan permanen); tiket juga ditempel di WebSocket supaya bisa dipulihkan setelah
 * objek hibernate. Batas waktu ditangani alarm.
 */
export class Matchmaker extends DurableObject<Env> {
  private core: MatchmakerCore | null = null;
  private readonly sockets = new Map<string, WebSocket>();
  private readonly messages = new Map<string, number>();

  override async fetch(): Promise<Response> {
    this.ensureCore();
    // Lonjakan koneksi (serangan atau uji beban) ditolak sebelum memakan memori objek.
    if (this.sockets.size >= MAX_QUEUE + 200) {
      return new Response("busy", { status: 503, headers: { "Retry-After": "10" } });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const id = randomId();
    server.serializeAttachment({ id, ticket: null } satisfies Attachment);
    this.sockets.set(id, server);
    setTimeout(() => {
      // Belum masuk antrean dan belum dipasangkan: socket menganggur.
      const ws = this.sockets.get(id);
      if (ws && !this.core?.has(id)) {
        this.sockets.delete(id);
        try {
          ws.close(1008, "idle");
        } catch {
          // Sudah tertutup.
        }
      }
    }, QUEUE_HELLO_TIMEOUT_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    const core = this.ensureCore();
    if (!att || typeof message !== "string") {
      ws.close(1008, "bad-message");
      return;
    }
    // Klien sah hanya mengirim satu pesan; objek ini dipakai bersama semua pemain, jadi
    // socket yang terus mengirim diputus sebelum membebaninya.
    const count = (this.messages.get(att.id) ?? 0) + 1;
    this.messages.set(att.id, count);
    if (count > MAX_MESSAGES_PER_SOCKET) {
      this.ensureCore().leave(att.id);
      ws.close(1008, "rate-limited");
      return;
    }
    core.message(att.id, message);
    await this.armAlarm();
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  override async alarm(): Promise<void> {
    await this.armAlarm();
  }

  private gone(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    this.ensureCore().leave(att.id);
    this.sockets.delete(att.id);
    this.messages.delete(att.id);
  }

  private async armAlarm(): Promise<void> {
    const next = this.ensureCore().sweep();
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  private socketOf(id: string): WebSocket | null {
    return this.sockets.get(id) ?? null;
  }

  private ensureCore(): MatchmakerCore {
    if (this.core) return this.core;
    const core = new MatchmakerCore({
      now: () => Date.now(),
      newRoomCode: () => roomCodeFromBytes(crypto.getRandomValues(new Uint8Array(6))),
      send: (id, msg) => {
        try {
          this.socketOf(id)?.send(JSON.stringify(msg));
        } catch {
          // Socket sudah tertutup.
        }
      },
      close: (id) => {
        try {
          this.socketOf(id)?.close(1000, "done");
        } catch {
          // Socket sudah tertutup.
        }
      },
      remember: (id, ticket) => {
        this.socketOf(id)?.serializeAttachment({ id, ticket } satisfies Attachment);
      },
    });
    const tickets: Ticket[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.sockets.set(att.id, ws);
      if (att.ticket) tickets.push(att.ticket);
    }
    core.restore(tickets);
    this.core = core;
    return core;
  }
}

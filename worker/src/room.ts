import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { playerIdFromSecret } from "./leaderboard-core";
import { type Conn, HELLO_TIMEOUT_MS, type MatchResult, RoomCore } from "./room-core";

interface Attachment {
  id: string;
  origin: string | null;
}

const TICK_INTERVAL_MS = 1000 / 60;

const randomHex = (bytes: number): string =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/**
 * Satu Durable Object per room. Memakai WebSocket Hibernation agar room yang
 * menunggu pemain tidak ditagih durasi; selama pertandingan berjalan, interval
 * simulasi membuat objek tetap aktif.
 */
export class Room extends DurableObject<Env> {
  private core: RoomCore | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly conns = new Map<string, Conn>();
  private readonly bySocket = new WeakMap<WebSocket, Conn>();

  override async fetch(request: Request): Promise<Response> {
    const code = new URL(request.url).pathname.split("/").pop() ?? "";
    const core = this.ensureCore(code);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const id = randomHex(8);
    // Hanya disimpan di memori room selama pertandingan, untuk aturan peringkat.
    const origin = request.headers.get("CF-Connecting-IP");
    server.serializeAttachment({ id, origin } satisfies Attachment);
    if (core.open(this.connFor(server, id, origin))) {
      setTimeout(() => this.core?.sweepIdle(), HELLO_TIMEOUT_MS + 50);
    } else {
      this.conns.delete(id);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const core = this.core;
    const conn = this.connOf(ws);
    // Objek pernah hibernate tanpa state room: minta client menyambung ulang.
    if (!core || !conn) {
      ws.close(1012, "restart");
      return;
    }
    core.message(conn, message);
    this.syncTimer();
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.handleGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.handleGone(ws);
  }

  private handleGone(ws: WebSocket): void {
    const conn = this.connOf(ws);
    if (conn && this.core) this.core.close(conn);
    if (conn) this.conns.delete(conn.id);
    this.syncTimer();
  }

  private ensureCore(code: string): RoomCore {
    if (!this.core) {
      this.core = new RoomCore(code, {
        now: () => Date.now(),
        randomSeed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1,
        randomToken: () => randomHex(16),
        reportResult: (r) => {
          this.ctx.waitUntil(this.report(r));
        },
      });
    }
    return this.core;
  }

  private async report(r: MatchResult): Promise<void> {
    try {
      const [winnerId, loserId] = await Promise.all([
        playerIdFromSecret(r.winner.secret),
        playerIdFromSecret(r.loser.secret),
      ]);
      const board = this.env.LEADERBOARD.get(this.env.LEADERBOARD.idFromName("global"));
      await board.report({ winnerId, winnerName: r.winner.nick, loserId, loserName: r.loser.nick });
    } catch (err) {
      // Leaderboard tidak boleh mengganggu pertandingan; cukup dicatat.
      console.error("leaderboard report failed", err);
    }
  }

  private connFor(ws: WebSocket, id: string, origin: string | null): Conn {
    const conn: Conn = {
      id,
      origin: origin ?? undefined,
      send: (data) => {
        try {
          ws.send(data);
        } catch {
          // Socket sudah tertutup; penutupan ditangani webSocketClose.
        }
      },
      close: (code, reason) => {
        try {
          ws.close(code, reason);
        } catch {
          // Abaikan socket yang sudah tertutup.
        }
      },
    };
    this.conns.set(id, conn);
    this.bySocket.set(ws, conn);
    return conn;
  }

  private connOf(ws: WebSocket): Conn | null {
    // Jalur cepat tanpa deserialisasi untuk ±60 pesan/detik per pemain; attachment hanya
    // dibaca bila objek baru bangun dari hibernasi.
    const cached = this.bySocket.get(ws);
    if (cached) return this.conns.has(cached.id) ? cached : null;
    const att = ws.deserializeAttachment() as Attachment | null;
    return att ? (this.conns.get(att.id) ?? null) : null;
  }

  private syncTimer(): void {
    const active = this.core?.needsTicking ?? false;
    if (active && !this.interval) {
      this.interval = setInterval(() => {
        this.core?.tick();
        if (!this.core?.needsTicking) this.syncTimer();
      }, TICK_INTERVAL_MS);
    } else if (!active && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.core && !this.core.exists && this.conns.size === 0) this.core = null;
  }
}

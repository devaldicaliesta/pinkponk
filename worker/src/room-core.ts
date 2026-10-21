import {
  type ClientControl,
  decodeInput,
  decodePing,
  EMOJIS,
  encodePong,
  encodeSnapshot,
  MAX_CLIENT_MESSAGE,
  MSG_INPUT,
  MSG_PING,
  messageType,
  PAUSE_MAX_MS,
  PAUSES_PER_MATCH,
  type PauseReason,
  parseClientControl,
  type RoomConfig,
  type RoomErrorCode,
  type ServerControl,
} from "@pinkponk/protocol";
import {
  dedupeNickname,
  Match,
  type MatchEvent,
  MS_PER_TICK,
  type Side,
  validateNickname,
} from "@pinkponk/sim";
import { TokenBucket } from "./token-bucket";

export interface Conn {
  readonly id: string;
  send(data: string | ArrayBuffer): void;
  close(code: number, reason: string): void;
}

interface Seat {
  conn: Conn | null;
  nick: string;
  token: string;
  disconnectedAt: number | null;
  rematch: boolean;
  pausesLeft: number;
  lastSeen: number;
}

export type RoomStatus = "lobby" | "playing" | "paused" | "over";

export const RECONNECT_GRACE_MS = 30_000;
// Klien mengirim input 30x/detik saat bermain; diam selama ini berarti koneksinya mati
// walau penutupan TCP belum sampai ke server.
export const SILENCE_MS = 5_000;
const SNAPSHOT_EVERY_TICKS = 4;
const MAX_CATCHUP_TICKS = 24;
const MESSAGES_PER_SECOND = 60;

export interface RoomDeps {
  now(): number;
  randomSeed(): number;
  randomToken(): string;
}

/** Logika satu room online, terpisah dari runtime Durable Object agar mudah dites. */
export class RoomCore {
  readonly seats: [Seat | null, Seat | null] = [null, null];
  config: RoomConfig | null = null;
  status: RoomStatus = "lobby";
  match: Match | null = null;
  private startMs = 0;
  /** Saat simulasi berhenti (dipakai untuk menggeser waktu saat lanjut). */
  private pausedAt = 0;
  private pauseDeadline = 0;
  private pauseReason: PauseReason | null = null;
  private pendingEvents: MatchEvent[] = [];
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly seatOf = new Map<string, Side>();

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
  ) {}

  get connectedCount(): number {
    return this.seats.filter((s) => s?.conn).length;
  }

  /** Room dianggap ada bila pembuatnya pernah bergabung dan masih ada pemain. */
  get exists(): boolean {
    return this.seats.some((s) => s !== null);
  }

  get needsTicking(): boolean {
    return this.status === "playing" || this.status === "paused";
  }

  open(conn: Conn): void {
    this.buckets.set(conn.id, new TokenBucket(MESSAGES_PER_SECOND, this.deps.now()));
  }

  message(conn: Conn, data: string | ArrayBuffer): void {
    const size = typeof data === "string" ? data.length : data.byteLength;
    const bucket = this.buckets.get(conn.id);
    if (!bucket?.take(this.deps.now())) {
      this.reject(conn, "rate-limited");
      return;
    }
    if (size > MAX_CLIENT_MESSAGE) {
      this.reject(conn, "bad-message");
      return;
    }
    const seen = this.seatOf.get(conn.id);
    if (seen !== undefined) {
      const s = this.seats[seen];
      if (s) s.lastSeen = this.deps.now();
    }
    if (typeof data === "string") {
      const msg = parseClientControl(data);
      if (!msg) {
        this.reject(conn, "bad-message");
        return;
      }
      this.control(conn, msg);
      return;
    }
    const seat = this.seatOf.get(conn.id);
    switch (messageType(data)) {
      case MSG_PING: {
        const clientMs = decodePing(data);
        if (clientMs === null) {
          this.reject(conn, "bad-message");
          return;
        }
        conn.send(encodePong(clientMs, this.serverMs()));
        return;
      }
      case MSG_INPUT: {
        const input = decodeInput(data);
        if (!input) {
          this.reject(conn, "bad-message");
          return;
        }
        if (seat !== undefined && this.match && this.status === "playing") {
          this.match.pushInput(seat, input);
        }
        return;
      }
      default:
        this.reject(conn, "bad-message");
    }
  }

  close(conn: Conn): void {
    this.buckets.delete(conn.id);
    const seat = this.seatOf.get(conn.id);
    this.seatOf.delete(conn.id);
    if (seat === undefined) return;
    const s = this.seats[seat];
    if (!s || s.conn?.id !== conn.id) return;
    s.conn = null;
    if (this.status === "playing" || (this.status === "paused" && this.pauseReason === "request")) {
      s.disconnectedAt = this.deps.now();
      this.pause(seat, "disconnect");
      return;
    }
    if (this.status === "paused") {
      s.disconnectedAt = this.deps.now();
      return;
    }
    // Di lobby atau setelah selesai, kursi dilepas.
    this.seats[seat] = null;
    this.broadcast({ t: "left", player: seat });
    if (this.status === "lobby") this.broadcastLobby();
    if (!this.exists) this.config = null;
  }

  /** Majukan simulasi sesuai waktu nyata. Dipanggil ±60 kali per detik oleh Durable Object. */
  tick(): void {
    const now = this.deps.now();
    if (this.status === "paused") {
      if (now >= this.pauseDeadline) {
        if (this.pauseReason === "disconnect") this.walkover();
        else this.unpause();
      }
      return;
    }
    const m = this.match;
    if (this.status !== "playing" || !m) return;
    for (const s of this.seats) {
      if (s?.conn && now - s.lastSeen > SILENCE_MS) {
        const conn = s.conn;
        conn.close(4000, "silent");
        this.close(conn);
        return;
      }
    }
    const target = Math.floor((now - this.startMs) / MS_PER_TICK);
    let steps = Math.min(MAX_CATCHUP_TICKS, target - m.tick);
    while (steps-- > 0) {
      m.step();
      this.pendingEvents.push(...m.events);
      if (m.tick % SNAPSHOT_EVERY_TICKS === 0) this.sendSnapshot();
    }
    if (m.phase === "over") {
      this.sendSnapshot();
      this.status = "over";
    }
  }

  private control(conn: Conn, msg: ClientControl): void {
    const seat = this.seatOf.get(conn.id);
    switch (msg.t) {
      case "hello":
        if (seat === undefined) this.hello(conn, msg);
        return;
      case "rematch":
        if (seat !== undefined) this.rematch(seat);
        return;
      case "pause": {
        const s = seat === undefined ? null : this.seats[seat];
        if (seat !== undefined && s && this.status === "playing" && s.pausesLeft > 0) {
          s.pausesLeft -= 1;
          this.pause(seat, "request");
        }
        return;
      }
      case "resume":
        if (seat !== undefined && this.status === "paused" && this.pauseReason === "request") {
          this.unpause();
        }
        return;
      case "emoji":
        if (seat !== undefined && this.status !== "lobby") {
          this.broadcast({ t: "emoji", player: seat, e: Math.min(msg.e, EMOJIS.length - 1) });
        }
        return;
    }
  }

  private hello(conn: Conn, msg: Extract<ClientControl, { t: "hello" }>): void {
    const nick = validateNickname(msg.nick);
    if (!nick.ok) {
      this.reject(conn, "bad-nickname");
      return;
    }

    // Sambung ulang ke kursi yang sama memakai token dari pesan welcome.
    const resumed = this.seats.findIndex(
      (s) => s !== null && s.conn === null && msg.token !== null && s.token === msg.token,
    );
    if (resumed === 0 || resumed === 1) {
      this.resume(conn, resumed);
      return;
    }

    if (!this.exists) {
      if (!msg.create) {
        this.reject(conn, "not-found");
        return;
      }
      this.config = msg.config;
      this.seat(conn, 0, nick.value);
      return;
    }
    const free = this.seats.indexOf(null);
    if ((free !== 0 && free !== 1) || this.status !== "lobby") {
      this.reject(conn, "full");
      return;
    }
    const taken = this.seats.filter((s): s is Seat => s !== null).map((s) => s.nick);
    this.seat(conn, free, dedupeNickname(nick.value, taken));
    if (this.seats[0]?.conn && this.seats[1]?.conn) this.startMatch();
  }

  private seat(conn: Conn, side: Side, nick: string): void {
    const token = this.deps.randomToken();
    this.seats[side] = {
      conn,
      nick,
      token,
      disconnectedAt: null,
      rematch: false,
      pausesLeft: PAUSES_PER_MATCH,
      lastSeen: this.deps.now(),
    };
    this.seatOf.set(conn.id, side);
    this.sendTo(conn, { t: "welcome", you: side, code: this.code, token });
    this.broadcastLobby();
  }

  private resume(conn: Conn, side: Side): void {
    const s = this.seats[side];
    if (!s) return;
    s.conn = conn;
    s.disconnectedAt = null;
    s.lastSeen = this.deps.now();
    this.seatOf.set(conn.id, side);
    this.sendTo(conn, { t: "welcome", you: side, code: this.code, token: s.token });
    if (this.config && this.seats[0] && this.seats[1]) {
      this.sendTo(conn, {
        t: "start",
        config: this.config,
        players: [this.seats[0].nick, this.seats[1].nick],
      });
    }
    const bothBack = this.seats.every((x) => x?.conn);
    if (this.status === "paused" && this.pauseReason === "disconnect" && bothBack) this.unpause();
  }

  private pause(player: Side, reason: PauseReason): void {
    const now = this.deps.now();
    if (this.status === "playing") this.pausedAt = now;
    this.status = "paused";
    this.pauseReason = reason;
    this.pauseDeadline = now + (reason === "disconnect" ? RECONNECT_GRACE_MS : PAUSE_MAX_MS);
    this.broadcast({
      t: "paused",
      player,
      reason,
      resumeBy: this.pauseDeadline,
      pausesLeft: [this.seats[0]?.pausesLeft ?? 0, this.seats[1]?.pausesLeft ?? 0],
    });
  }

  private unpause(): void {
    // Waktu jeda tidak dihitung: geser titik awal simulasi.
    const now = this.deps.now();
    this.startMs += now - this.pausedAt;
    for (const s of this.seats) if (s) s.lastSeen = now;
    this.status = "playing";
    this.pauseReason = null;
    this.broadcast({ t: "resumed" });
  }

  private startMatch(): void {
    const [a, b] = this.seats;
    if (!a || !b || !this.config) return;
    this.match = new Match({
      mode: this.config.mode,
      bestOf: this.config.bestOf,
      seed: this.deps.randomSeed(),
    });
    this.startMs = this.deps.now();
    this.pendingEvents = [];
    for (const s of [a, b]) {
      s.rematch = false;
      s.pausesLeft = PAUSES_PER_MATCH;
      s.lastSeen = this.deps.now();
    }
    this.pauseReason = null;
    this.status = "playing";
    this.broadcast({ t: "start", config: this.config, players: [a.nick, b.nick] });
  }

  private rematch(seat: Side): void {
    if (this.status !== "over") return;
    const s = this.seats[seat];
    if (!s) return;
    s.rematch = true;
    this.broadcast({ t: "rematch", player: seat });
    if (this.seats[0]?.rematch && this.seats[1]?.rematch) this.startMatch();
  }

  private walkover(): void {
    const m = this.match;
    const gone = this.seats.findIndex((s) => s !== null && s.conn === null);
    if (m && (gone === 0 || gone === 1)) {
      m.forfeit(gone);
      this.pendingEvents.push(...m.events);
    }
    this.status = "over";
    this.sendSnapshot();
  }

  private serverMs(): number {
    if (!this.match) return 0;
    if (this.status === "playing") return this.deps.now() - this.startMs;
    return this.match.tick * MS_PER_TICK;
  }

  private sendSnapshot(): void {
    const m = this.match;
    if (!m) return;
    const data = encodeSnapshot({
      tick: m.tick,
      phase: m.phase,
      phaseTick: m.phaseTick,
      server: m.server,
      winner: m.winner,
      points: [m.score.points[0], m.score.points[1]],
      games: [m.score.games[0], m.score.games[1]],
      fever: [m.inFever(0), m.inFever(1)],
      rallyHits: m.rally?.hits ?? 0,
      ball: m.ball,
      bats: [m.players[0].batX, m.players[1].batX],
      events: this.pendingEvents,
    });
    this.pendingEvents = [];
    for (const s of this.seats) s?.conn?.send(data);
  }

  private broadcastLobby(): void {
    if (!this.config) return;
    this.broadcast({
      t: "lobby",
      players: [this.seats[0]?.nick ?? null, this.seats[1]?.nick ?? null],
      config: this.config,
    });
  }

  private broadcast(msg: ServerControl): void {
    const text = JSON.stringify(msg);
    for (const s of this.seats) s?.conn?.send(text);
  }

  private sendTo(conn: Conn, msg: ServerControl): void {
    conn.send(JSON.stringify(msg));
  }

  private reject(conn: Conn, code: RoomErrorCode): void {
    this.sendTo(conn, { t: "error", code });
    conn.close(1008, code);
    this.close(conn);
  }
}

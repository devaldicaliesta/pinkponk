import type { RoomConfig, ServerControl, Snapshot } from "@pinkponk/protocol";
import {
  BAT_MAX_X,
  BAT_SPEED,
  type MatchEvent,
  MS_PER_TICK,
  type PlayMode,
  predictCrossing,
  type Side,
} from "@pinkponk/sim";
import type { NetClient, NetError } from "../net/client";
import { SnapshotBuffer } from "../net/interpolate";
import type { HumanInput } from "./input";
import type { CrossingView, MatchView, NetStatus, Session } from "./session";

/** Waktu tampilan di belakang server agar selalu ada dua snapshot untuk diinterpolasi. */
const INTERP_MS = 100;
const SEND_EVERY_MS = 1000 / 30;
const RECONNECT_GRACE_MS = 30_000;

const EMPTY_VIEW: MatchView = {
  tick: 0,
  phase: "countdown",
  phaseTick: 0,
  server: 0,
  winner: null,
  points: [0, 0],
  games: [0, 0],
  fever: [false, false],
  rallyHits: 0,
  ball: { pos: { x: 0, y: 0.24, z: 1.49 }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } },
  bats: [0, 0],
};

export class OnlineSession implements Session {
  readonly kind = "online" as const;
  readonly mode: PlayMode;
  readonly bestOf: number;
  private buffer = new SnapshotBuffer();
  private consumedTick = 0;
  private events: MatchEvent[] = [];
  private current: MatchView = EMPTY_VIEW;
  private renderMs = 0;
  private lastSend = 0;
  private batX = 0;
  private lastWall: number | null = null;
  private bouncedOnMe = false;
  private status: NetStatus = {
    pingMs: null,
    paused: null,
    opponentLeft: false,
    reconnecting: false,
    rematch: [false, false],
  };
  /** Dipanggil saat koneksi gagal permanen. */
  onFatal: ((e: NetError) => void) | null = null;
  onEmoji: ((player: Side, e: number) => void) | null = null;

  constructor(
    private readonly client: NetClient,
    readonly you: Side,
    readonly names: [string, string],
    config: RoomConfig,
    private readonly input: HumanInput,
    private readonly calibrationMs: number,
  ) {
    this.mode = config.mode;
    this.bestOf = config.bestOf;
    client.setHandlers({
      onControl: (m) => this.onControl(m),
      onSnapshot: (s) => this.buffer.push(s),
      onClose: (e) => {
        this.status.reconnecting = e === null;
        if (e) this.onFatal?.(e);
      },
    });
  }

  private wallToSimMs = (wall: number): number =>
    this.client.clock.serverNow(wall) - INTERP_MS - this.calibrationMs;

  update(wallMs: number): void {
    const dt = this.lastWall === null ? 0 : Math.min(0.1, (wallMs - this.lastWall) / 1000);
    this.lastWall = wallMs;
    this.renderMs = this.client.clock.serverNow(wallMs) - INTERP_MS;
    this.status.pingMs = this.client.clock.rtt;

    for (const s of this.buffer.takeUntil(this.renderMs, this.consumedTick)) {
      this.consumedTick = s.tick;
      this.trackRally(s.events);
      this.events.push(...s.events);
    }

    const viewTick = Math.max(0, Math.floor(this.renderMs / MS_PER_TICK));
    if (wallMs - this.lastSend >= SEND_EVERY_MS) {
      this.lastSend = wallMs;
      const input = this.input.read(viewTick, this.wallToSimMs);
      // Kursi 1 melihat meja dari sisi sebaliknya: kanan layar = -x dunia.
      if (this.you === 1) {
        input.x = -input.x;
        input.aim = -input.aim;
      }
      // Bat sendiri diprediksi lokal dengan batas kecepatan yang sama dengan server.
      const step = BAT_SPEED * Math.max(dt, SEND_EVERY_MS / 1000);
      this.batX = Math.max(
        -BAT_MAX_X,
        Math.min(BAT_MAX_X, this.batX + clampStep(input.x - this.batX, step)),
      );
      this.client.sendInput({ ...input, x: this.batX });
    }

    const sample = this.buffer.sample(this.renderMs);
    if (!sample) return;
    this.current = toView(sample.snapshot, sample.ballPos, sample.bats);
    if (this.mode === "swing") this.current.bats[this.you] = this.batX;
  }

  private trackRally(events: MatchEvent[]): void {
    for (const e of events) {
      if (e.type === "hit") this.bouncedOnMe = false;
      if (e.type === "bounce" && e.side === this.you) this.bouncedOnMe = true;
      if (e.type === "point") this.bouncedOnMe = false;
    }
  }

  private onControl(m: ServerControl): void {
    switch (m.t) {
      case "start":
        // Pertandingan baru (rematch): tick server mulai lagi dari nol.
        this.buffer.clear();
        this.consumedTick = 0;
        this.client.clock.reset();
        this.status.rematch = [false, false];
        this.status.opponentLeft = false;
        break;
      case "paused":
        // Jam server dan perangkat bisa berbeda; hitung ulang batas waktu secara lokal.
        this.status.paused = { player: m.player, resumeBy: Date.now() + RECONNECT_GRACE_MS };
        break;
      case "resumed":
        this.status.paused = null;
        this.client.clock.reset();
        break;
      case "left":
        this.status.opponentLeft = true;
        break;
      case "rematch":
        this.status.rematch[m.player] = true;
        break;
      case "welcome":
        this.status.reconnecting = false;
        break;
      case "emoji":
        this.onEmoji?.(m.player, m.e);
        break;
      default:
        break;
    }
  }

  view(): MatchView {
    return this.current;
  }

  drainEvents(): MatchEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  viewMs(): number {
    return this.renderMs;
  }

  crossing(p: Side): CrossingView | null {
    const v = this.current;
    if (v.phase !== "rally") return null;
    const towardP = p === 0 ? v.ball.vel.z > 0 : v.ball.vel.z < 0;
    if (!towardP && !this.bouncedOnMe) return null;
    const c = predictCrossing(v.ball, p, this.bouncedOnMe);
    return c ? { atMs: this.renderMs + c.ticks * MS_PER_TICK, x: c.x, y: c.y, z: c.z } : null;
  }

  setPaused(): void {}

  canPause(): boolean {
    return false;
  }

  rematch(): void {
    this.status.rematch[this.you] = true;
    this.client.sendControl({ t: "rematch" });
  }

  sendEmoji(e: number): void {
    this.client.sendControl({ t: "emoji", e });
  }

  net(): NetStatus {
    return this.status;
  }

  injectTap(wallMs: number): void {
    this.input.injectTap?.(wallMs);
  }

  dispose(): void {
    this.input.dispose();
    this.client.close();
  }
}

const clampStep = (d: number, max: number) => Math.max(-max, Math.min(max, d));

const toView = (
  s: Snapshot,
  ballPos: MatchView["ball"]["pos"],
  bats: [number, number],
): MatchView => ({
  tick: s.tick,
  phase: s.phase,
  phaseTick: s.phaseTick,
  server: s.server,
  winner: s.winner,
  points: s.points,
  games: s.games,
  fever: s.fever,
  rallyHits: s.rallyHits,
  ball: { pos: ballPos, vel: s.ball.vel, spin: s.ball.spin },
  bats: [bats[0], bats[1]],
});

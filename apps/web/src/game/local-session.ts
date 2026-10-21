import {
  AI_PROFILES,
  AiController,
  BAT_SPEED,
  type BestOf,
  type Difficulty,
  Match,
  type MatchEvent,
  MS_PER_TICK,
  type PlayMode,
  type Side,
  type Vec3,
} from "@pinkponk/sim";
import type { HumanInput } from "./input";
import type { CrossingView, MatchView, Session } from "./session";

export interface LocalOptions {
  mode: PlayMode;
  bestOf: BestOf;
  /** null = 2 pemain lokal (kedua sisi manusia). */
  difficulty: Difficulty | null;
  names: [string, string];
  inputs: [HumanInput, HumanInput | null];
  calibrationMs: number;
}

const MAX_STEPS_PER_FRAME = 24;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;

/** Pertandingan yang seluruh simulasinya berjalan di browser (Vs AI dan 2 pemain lokal). */
export class LocalSession implements Session {
  readonly kind: "ai" | "local";
  readonly you: Side | null;
  readonly names: [string, string];
  readonly mode: PlayMode;
  readonly bestOf: number;
  match: Match;
  private ai: AiController | null;
  private events: MatchEvent[] = [];
  private lastWall: number | null = null;
  private acc = 0;
  private paused = false;
  // Pasangan (waktu simulasi, waktu dinding) di awal frame untuk konversi waktu tap.
  private anchorSim = 0;
  private anchorWall = 0;
  timeScale = 1;
  private prevBall: Vec3 = { x: 0, y: 0, z: 0 };
  private prevBats: [number, number] = [0, 0];
  autoplay: AiController | null = null;

  constructor(private readonly opts: LocalOptions) {
    this.kind = opts.difficulty ? "ai" : "local";
    this.you = opts.difficulty ? 0 : null;
    this.names = opts.names;
    this.mode = opts.mode;
    this.bestOf = opts.bestOf;
    this.match = this.createMatch();
    this.ai = this.createAi();
  }

  private createMatch(): Match {
    const aiSpeed = this.opts.difficulty ? AI_PROFILES[this.opts.difficulty].speed : BAT_SPEED;
    return new Match({
      mode: this.opts.mode,
      bestOf: this.opts.bestOf,
      seed: randomSeed(),
      batSpeed: [BAT_SPEED, aiSpeed],
    });
  }

  private createAi(): AiController | null {
    return this.opts.difficulty ? new AiController(1, this.opts.difficulty, randomSeed()) : null;
  }

  private wallToSimMs = (wall: number): number =>
    this.anchorSim + (wall - this.anchorWall) * this.timeScale - this.opts.calibrationMs;

  update(wallMs: number): void {
    if (this.lastWall === null || this.paused) {
      this.lastWall = wallMs;
      return;
    }
    this.anchorSim = this.match.tick * MS_PER_TICK + this.acc;
    this.anchorWall = this.lastWall;
    this.acc += Math.min(250, wallMs - this.lastWall) * this.timeScale;
    this.lastWall = wallMs;
    let steps = 0;
    const limit = MAX_STEPS_PER_FRAME * Math.max(1, this.timeScale);
    while (this.acc >= MS_PER_TICK && steps < limit) {
      this.stepOnce();
      this.acc -= MS_PER_TICK;
      steps++;
    }
    if (steps >= limit) this.acc = 0;
  }

  private stepOnce(): void {
    const m = this.match;
    const [p0, p1] = this.opts.inputs;
    m.pushInput(0, this.autoplay ? this.autoplay.input(m) : p0.read(m.tick, this.wallToSimMs));
    if (this.ai) m.pushInput(1, this.ai.input(m));
    else if (p1) m.pushInput(1, p1.read(m.tick, this.wallToSimMs));
    this.prevBall = { ...m.ball.pos };
    this.prevBats = [m.players[0].batX, m.players[1].batX];
    m.step();
    if (m.events.length) this.events.push(...m.events);
  }

  view(): MatchView {
    const m = this.match;
    return {
      tick: m.tick,
      phase: m.phase,
      phaseTick: m.phaseTick,
      server: m.server,
      winner: m.winner,
      points: [m.score.points[0], m.score.points[1]],
      games: [m.score.games[0], m.score.games[1]],
      fever: [m.inFever(0), m.inFever(1)],
      rallyHits: m.rally?.hits ?? 0,
      ball: { ...m.ball, pos: this.smoothBall() },
      bats: [
        lerp(this.prevBats[0], m.players[0].batX, this.alpha()),
        lerp(this.prevBats[1], m.players[1].batX, this.alpha()),
      ],
    };
  }

  // Layar jarang pas di tick simulasi (120 Hz); tampilkan posisi di antara dua tick
  // terakhir sesuai sisa waktu agar gerakan bola dan bat tidak tersendat.
  private alpha(): number {
    return Math.max(0, Math.min(1, this.acc / MS_PER_TICK));
  }

  private smoothBall(): Vec3 {
    const cur = this.match.ball.pos;
    const prev = this.prevBall;
    // Bola dipindah mendadak (servis baru, pukulan dengan kompensasi lag): jangan diinterpolasi.
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z) > 0.5) return { ...cur };
    const t = this.alpha();
    return { x: lerp(prev.x, cur.x, t), y: lerp(prev.y, cur.y, t), z: lerp(prev.z, cur.z, t) };
  }

  drainEvents(): MatchEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  viewMs(): number {
    return this.match.tick * MS_PER_TICK + this.acc;
  }

  crossing(p: Side): CrossingView | null {
    const c = this.match.upcomingCrossing(p);
    return c ? { atMs: c.tick * MS_PER_TICK, x: c.x, y: c.y, z: c.z } : null;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.lastWall = null;
  }

  canPause(): boolean {
    return true;
  }

  rematch(): void {
    this.match = this.createMatch();
    this.ai = this.createAi();
    this.events = [];
    this.acc = 0;
    this.lastWall = null;
  }

  net() {
    return null;
  }

  injectTap(wallMs: number): void {
    this.opts.inputs[0].injectTap?.(wallMs);
  }

  dispose(): void {
    this.opts.inputs[0].dispose();
    this.opts.inputs[1]?.dispose();
  }
}

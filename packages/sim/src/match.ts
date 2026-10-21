import { type Ball, type BallContact, copyBall, type Side, stepBall } from "./ball";
import {
  BAT_MAX_X,
  BAT_SPEED,
  COUNTDOWN_TICKS,
  DT,
  HIT_PLANE_Z,
  MAX_LAG_TICKS,
  MS_PER_TICK,
  POINT_PAUSE_TICKS,
  RALLY_TIMEOUT_TICKS,
  REACH,
  SERVE_AUTO_TICKS,
  SERVE_TOSS_VY,
  TABLE_HALF_L,
  TICK_RATE,
} from "./constants";
import {
  addStack,
  canActivate,
  createGamble,
  type GambleState,
  type Mods,
  modsFor,
  NO_MODS,
  rollAbility,
  STACK_PER_POINT,
  STACK_PER_RETURN,
  tickPoint,
} from "./gamble";
import { sanitizeInput } from "./input";
import { atHitPoint, predictCrossing } from "./predict";
import { createRng, type Rng, range } from "./rng";
import {
  onDead,
  onHit,
  onNetTouch,
  onTableBounce,
  type Rally,
  type RallyResult,
  startServe,
} from "./rules";
import { awardPoint, createScore, currentServer, other, type Score } from "./score";
import { type Shot, swingShot, timingShot } from "./shots";
import { solveServe } from "./solver";
import {
  FEVER_MS,
  FEVER_STREAK,
  gradeTiming,
  rallySpeedFactor,
  TIMING_WINDOWS_MS,
  type TimingGrade,
} from "./timing";
import {
  emptyInput,
  type MatchConfig,
  type MatchEvent,
  type MatchPhase,
  type PlayerInput,
} from "./types";
import { vec } from "./vec";

interface PendingHit {
  player: Side;
  tick: number;
  ball: Ball;
}

interface PlayerSlot {
  batX: number;
  batSpeed: number;
  latest: PlayerInput;
  history: PlayerInput[];
  taps: number[];
  servePressed: boolean;
  /** ms simulasi saat bola menyeberang net menuju pemain ini. */
  armMs: number;
  streak: number;
  feverUntil: number;
  /** Tujuan bat otomatis di mode timing. */
  autoX: number;
  gamble: GambleState;
  abilityPressed: boolean;
}

const HISTORY_LIMIT = 90;
const SERVE_HEIGHT = 0.24;
const SERVE_Z = TABLE_HALF_L + 0.12;

const createSlot = (speed: number): PlayerSlot => ({
  batX: 0,
  batSpeed: speed,
  latest: emptyInput(),
  history: [],
  taps: [],
  servePressed: false,
  armMs: Number.POSITIVE_INFINITY,
  streak: 0,
  feverUntil: 0,
  autoX: 0,
  gamble: createGamble(),
  abilityPressed: false,
});

export class Match {
  readonly config: MatchConfig;
  tick = 0;
  phase: MatchPhase;
  phaseTick = 0;
  ball: Ball = { pos: vec(0, SERVE_HEIGHT, SERVE_Z), vel: vec(), spin: vec() };
  score: Score;
  server: Side;
  rally: Rally | null = null;
  pending: PendingHit | null = null;
  winner: Side | null = null;
  events: MatchEvent[] = [];
  readonly players: [PlayerSlot, PlayerSlot];
  private readonly rng: Rng;
  private lastHitTick = 0;

  constructor(config: MatchConfig) {
    this.config = config;
    this.rng = createRng(config.seed);
    const speeds = config.batSpeed ?? [BAT_SPEED, BAT_SPEED];
    this.players = [createSlot(speeds[0]), createSlot(speeds[1])];
    this.server = config.firstServer ?? 0;
    this.score = createScore(config.bestOf, this.server);
    this.phase = config.skipCountdown ? "serve" : "countdown";
    this.placeBallForServe();
  }

  get nowMs(): number {
    return this.tick * MS_PER_TICK;
  }

  inFever(p: Side): boolean {
    return this.players[p].feverUntil > this.tick;
  }

  pushInput(p: Side, raw: PlayerInput): void {
    const input = sanitizeInput(raw, this.tick);
    const slot = this.players[p];
    slot.latest = input;
    slot.history.push(input);
    if (slot.history.length > HISTORY_LIMIT) slot.history.shift();
    if (input.serve) slot.servePressed = true;
    if (input.ability) slot.abilityPressed = true;
    if (input.tapMs !== null) {
      slot.taps.push(input.tapMs);
      if (slot.taps.length > 16) slot.taps.shift();
    }
  }

  step(): void {
    this.tick += 1;
    this.events = [];
    this.handleAbilityPresses();
    this.moveBats();
    switch (this.phase) {
      case "countdown":
        if (this.tick - this.phaseTick >= COUNTDOWN_TICKS) this.setPhase("serve");
        break;
      case "serve":
        this.stepServe();
        break;
      case "toss":
        this.stepToss();
        break;
      case "rally":
        this.stepRally();
        break;
      case "point":
        this.stepBallOnly();
        if (this.tick - this.phaseTick >= POINT_PAUSE_TICKS) this.nextPoint();
        break;
      case "over":
        this.stepBallOnly();
        break;
    }
    this.expireFever();
  }

  private setPhase(phase: MatchPhase): void {
    this.phase = phase;
    this.phaseTick = this.tick;
    if (phase === "serve") {
      this.players[0].servePressed = false;
      this.players[1].servePressed = false;
      this.placeBallForServe();
      for (const p of [0, 1] as const) {
        if (this.players[p].gamble.armed) this.activateAbility(p);
      }
    }
  }

  private placeBallForServe(): void {
    const dir = this.server === 0 ? 1 : -1;
    this.ball = {
      pos: vec(this.players[this.server].batX, SERVE_HEIGHT, dir * SERVE_Z),
      vel: vec(),
      spin: vec(),
    };
  }

  private moveBats(): void {
    for (const p of [0, 1] as const) {
      const slot = this.players[p];
      const target = this.config.mode === "timing" ? slot.autoX : slot.latest.x;
      const boost = this.config.mode === "timing" ? 1.6 : 1;
      const maxStep = slot.batSpeed * this.mods(p).batSpeed * DT * boost;
      const d = Math.max(-maxStep, Math.min(maxStep, target - slot.batX));
      slot.batX = Math.max(-BAT_MAX_X, Math.min(BAT_MAX_X, slot.batX + d));
    }
  }

  private stepServe(): void {
    const slot = this.players[this.server];
    this.ball.pos.x = slot.batX;
    const waited = this.tick - this.phaseTick;
    if (slot.servePressed || waited >= SERVE_AUTO_TICKS) {
      slot.servePressed = false;
      this.ball.vel = vec(0, SERVE_TOSS_VY, 0);
      this.events.push({ type: "toss", player: this.server });
      this.setPhase("toss");
    }
  }

  private stepToss(): void {
    stepBall(this.ball);
    if (this.ball.vel.y < 0 && this.ball.pos.y <= SERVE_HEIGHT) {
      const input = this.players[this.server].latest;
      const timing = this.config.mode === "timing";
      const power = timing ? range(this.rng, 0.3, 0.7) : input.power;
      const solved = solveServe(this.ball.pos, input.aim, power, timing ? 0.2 : input.lift);
      this.ball.vel = solved.vel;
      this.ball.spin = solved.spin;
      this.rally = startServe(this.server);
      this.lastHitTick = this.tick;
      this.events.push({ type: "hit", player: this.server, shot: "serve", grade: null });
      this.setPhase("rally");
      this.updateAutoTargets();
    }
  }

  private stepBallOnly(): void {
    stepBall(this.ball);
  }

  private stepRally(): void {
    const rally = this.rally;
    if (!rally) return;
    const prevZ = this.ball.pos.z;
    const contact = stepBall(this.ball);
    this.armOnNetCross(prevZ, rally, this.nowMs);
    if (contact) {
      const result = this.applyContact(rally, contact);
      if (result.kind !== "continue") {
        this.endPoint(result);
        return;
      }
    }
    if (!this.pending && rally.phase === "await-return" && atHitPoint(this.ball, rally.expected)) {
      this.pending = { player: rally.expected, tick: this.tick, ball: copyBall(this.ball) };
      if (this.config.mode === "timing") {
        const x = Math.max(-BAT_MAX_X, Math.min(BAT_MAX_X, this.ball.pos.x));
        this.players[rally.expected].batX = x;
      }
    }
    if (this.pending) this.tryResolvePending();
    if (this.phase === "rally" && this.tick - this.lastHitTick > RALLY_TIMEOUT_TICKS) {
      this.endPoint(onDead(rally));
    }
  }

  private armOnNetCross(prevZ: number, rally: Rally, atMs: number): void {
    const crossed = (prevZ > 0 && this.ball.pos.z <= 0) || (prevZ < 0 && this.ball.pos.z >= 0);
    if (!crossed) return;
    const toward: Side = this.ball.pos.z > 0 ? 0 : 1;
    if (toward === rally.lastHitter) return;
    this.players[toward].armMs = atMs;
  }

  private applyContact(rally: Rally, contact: BallContact): RallyResult {
    if (contact.kind === "net") {
      this.events.push({ type: "net" });
      onNetTouch(rally);
      return { kind: "continue" };
    }
    if (contact.kind === "table") {
      this.events.push({ type: "bounce", side: contact.side, x: contact.x, z: contact.z });
      // Selama menunggu input pemain yang tertinggal (lag), aturan reli ditahan.
      if (this.pending) return { kind: "continue" };
      const r = onTableBounce(rally, contact.side);
      this.updateAutoTargets();
      return r;
    }
    this.events.push({ type: "floor" });
    if (this.pending) return { kind: "continue" };
    return onDead(rally);
  }

  private tryResolvePending(): void {
    const pending = this.pending;
    if (!pending) return;
    if (this.config.mode === "timing") this.resolveTiming(pending);
    else this.resolveSwing(pending);
  }

  private resolveSwing(pending: PendingHit): void {
    const slot = this.players[pending.player];
    const seen = slot.history.find((i) => i.viewTick >= pending.tick);
    if (!seen && this.tick < pending.tick + MAX_LAG_TICKS) return;
    const input = seen ?? slot.latest;
    // Posisi bat versi pemain diterima selama masih masuk akal terhadap posisi di server.
    const mods = this.mods(pending.player);
    const lagS = Math.max(0, this.tick - input.viewTick) / TICK_RATE;
    const tolerance = slot.batSpeed * mods.batSpeed * lagS + 0.05;
    const x = Math.max(slot.batX - tolerance, Math.min(slot.batX + tolerance, input.x));
    const offset = Math.abs(pending.ball.pos.x - x);
    if (offset > REACH * mods.reach) {
      if (!this.shieldSave(pending)) this.missPending(pending, null);
      return;
    }
    const shot = swingShot(
      pending.ball.pos,
      pending.player,
      // Akurasi tepi bat diukur relatif terhadap jangkauan bat saat ini.
      { aim: input.aim, lift: input.lift, power: input.power, offset: offset / mods.reach },
      this.rng,
      { speed: mods.shotSpeed, sigma: mods.sigma },
    );
    this.applyHit(pending, shot, null);
  }

  private resolveTiming(pending: PendingHit): void {
    const slot = this.players[pending.player];
    const idealMs = pending.tick * MS_PER_TICK;
    const tap = slot.taps.find((t) => t >= slot.armMs);
    const windowEnd = idealMs + TIMING_WINDOWS_MS.edge;
    if (tap === undefined || tap > windowEnd) {
      const seenTick = slot.latest.viewTick;
      const windowTicks = Math.ceil(TIMING_WINDOWS_MS.edge / MS_PER_TICK);
      const playerSawWindow = seenTick >= pending.tick + windowTicks;
      const deadline = pending.tick + windowTicks + MAX_LAG_TICKS;
      if (playerSawWindow || this.tick >= deadline) {
        if (!this.shieldSave(pending)) this.missPending(pending, "miss");
      }
      return;
    }
    const grade = gradeTiming(tap - idealMs);
    slot.taps = [];
    if (grade === "miss") {
      if (!this.shieldSave(pending)) this.missPending(pending, "miss");
      return;
    }
    const fever = this.inFever(pending.player) && grade === "perfect" ? 1.15 : 1;
    const boost = this.mods(pending.player).shotSpeed;
    const factor = rallySpeedFactor(this.rally?.hits ?? 0) * fever * boost;
    const shot = timingShot(
      pending.ball.pos,
      pending.player,
      grade,
      slot.latest.aim,
      factor,
      this.rng,
    );
    this.events.push({ type: "judge", player: pending.player, grade });
    this.trackStreak(pending.player, grade);
    this.applyHit(pending, shot, grade);
  }

  private missPending(pending: PendingHit, grade: TimingGrade | null): void {
    this.pending = null;
    if (grade) {
      this.events.push({ type: "judge", player: pending.player, grade });
      this.trackStreak(pending.player, grade);
    }
    if (this.rally) this.endPoint(onDead(this.rally));
  }

  private applyHit(pending: PendingHit, shot: Shot, grade: TimingGrade | null): void {
    const rally = this.rally;
    this.pending = null;
    if (!rally) return;
    const result = onHit(rally, pending.player);
    if (result.kind !== "continue") {
      this.endPoint(result);
      return;
    }
    this.players[pending.player].taps = [];
    this.players[pending.player].armMs = Number.POSITIVE_INFINITY;
    this.lastHitTick = pending.tick;
    if (this.config.gamble) addStack(this.players[pending.player].gamble, STACK_PER_RETURN);
    this.events.push({ type: "hit", player: pending.player, shot: shot.kind, grade });
    // Pukulan terjadi di tick `pending.tick`; majukan bola ke tick sekarang.
    this.ball = copyBall(pending.ball);
    this.ball.vel = { ...shot.launch.vel };
    this.ball.spin = { ...shot.launch.spin };
    for (let t = pending.tick; t < this.tick && this.phase === "rally"; t++) {
      const prevZ = this.ball.pos.z;
      const contact = stepBall(this.ball);
      this.armOnNetCross(prevZ, rally, (t + 1) * MS_PER_TICK);
      if (!contact) continue;
      const r = this.applyContact(rally, contact);
      if (r.kind !== "continue") this.endPoint(r);
    }
    this.updateAutoTargets();
  }

  private trackStreak(p: Side, grade: TimingGrade): void {
    const slot = this.players[p];
    if (grade !== "perfect") {
      slot.streak = 0;
      return;
    }
    slot.streak += 1;
    if (slot.streak >= FEVER_STREAK && !this.inFever(p)) {
      slot.feverUntil = this.tick + Math.round((FEVER_MS / 1000) * TICK_RATE);
      slot.streak = 0;
      this.events.push({ type: "fever", player: p, on: true });
    }
  }

  private expireFever(): void {
    for (const p of [0, 1] as const) {
      const slot = this.players[p];
      if (slot.feverUntil !== 0 && slot.feverUntil === this.tick) {
        this.events.push({ type: "fever", player: p, on: false });
      }
    }
  }

  // Bat otomatis (mode timing) bergerak ke perkiraan titik pukul.
  private updateAutoTargets(): void {
    if (this.config.mode !== "timing" || !this.rally) return;
    const r = this.rally;
    const target = r.phase === "await-return" ? r.expected : other(r.lastHitter);
    const bounced = r.phase === "await-return";
    const c = predictCrossing(this.ball, target, bounced);
    if (c) this.players[target].autoX = c.x;
  }

  private endPoint(result: RallyResult): void {
    this.pending = null;
    if (result.kind === "continue") return;
    if (result.kind === "let") {
      this.events.push({ type: "point", winner: this.server, reason: "let" });
      this.setPhase("point");
      return;
    }
    this.events.push({ type: "point", winner: result.winner, reason: result.reason });
    let outcome = awardPoint(this.score, result.winner);
    // Poin ganda tidak melewati batas game: game yang sudah dimenangkan tidak ditambah lagi.
    if (this.mods(result.winner).pointValue > 1 && outcome.gameWon === null) {
      outcome = awardPoint(this.score, result.winner);
    }
    this.finishPointGamble(result.winner);
    if (outcome.gameWon !== null) this.events.push({ type: "game", winner: outcome.gameWon });
    if (outcome.matchWon !== null) {
      this.winner = outcome.matchWon;
      this.events.push({ type: "match", winner: outcome.matchWon });
    }
    this.setPhase("point");
  }

  private nextPoint(): void {
    this.rally = null;
    for (const slot of this.players) {
      slot.taps = [];
      slot.armMs = Number.POSITIVE_INFINITY;
    }
    if (this.winner !== null) {
      this.setPhase("over");
      return;
    }
    this.server = currentServer(this.score);
    this.setPhase("serve");
  }

  /** Pengali kemampuan Gamble yang berlaku untuk pemain `p` saat ini. */
  mods(p: Side): Mods {
    if (!this.config.gamble) return NO_MODS;
    return modsFor(this.players[p].gamble, this.players[other(p)].gamble);
  }

  private handleAbilityPresses(): void {
    for (const p of [0, 1] as const) {
      const slot = this.players[p];
      if (!slot.abilityPressed) continue;
      slot.abilityPressed = false;
      if (!this.config.gamble || !canActivate(slot.gamble) || this.phase === "over") continue;
      // Di tengah reli kemampuan baru aktif saat poin berikutnya dimulai, agar adil.
      if (this.phase === "rally" || this.phase === "toss") slot.gamble.armed = true;
      else this.activateAbility(p);
    }
  }

  private activateAbility(p: Side): void {
    const g = this.players[p].gamble;
    g.armed = false;
    if (!canActivate(g)) return;
    const { ability, points } = rollAbility(this.rng);
    g.stack = 0;
    g.ability = ability;
    g.pointsLeft = points;
    g.shieldUsed = false;
    this.events.push({ type: "ability", player: p, ability, points });
  }

  /** Perisai: bola yang terlewat dikembalikan sekali dengan pukulan blok lemah. */
  private shieldSave(pending: PendingHit): boolean {
    if (!this.mods(pending.player).shield) return false;
    this.players[pending.player].gamble.shieldUsed = true;
    this.events.push({ type: "shield", player: pending.player });
    const shot = swingShot(
      pending.ball.pos,
      pending.player,
      { aim: 0, lift: 0.3, power: 0.15, offset: 0 },
      this.rng,
    );
    this.applyHit(pending, shot, null);
    return true;
  }

  private finishPointGamble(winner: Side): void {
    if (!this.config.gamble) return;
    addStack(this.players[winner].gamble, STACK_PER_POINT);
    tickPoint(this.players[0].gamble);
    tickPoint(this.players[1].gamble);
  }

  /** Pemain `loser` keluar dari pertandingan (misalnya putus koneksi terlalu lama). */
  forfeit(loser: Side): void {
    if (this.winner !== null) return;
    this.winner = other(loser);
    this.pending = null;
    this.events.push({ type: "match", winner: this.winner });
    this.setPhase("over");
  }

  /** Perkiraan titik pukul berikutnya untuk pemain `p` (cincin timing, AI). */
  upcomingCrossing(p: Side) {
    const r = this.rally;
    if (this.phase !== "rally" || !r) return null;
    if (this.pending?.player === p) {
      const b = this.pending.ball.pos;
      return { tick: this.pending.tick, x: b.x, y: b.y, z: b.z };
    }
    const awaiting = r.phase === "await-return" && r.expected === p;
    const incoming = r.phase !== "await-return" && r.lastHitter !== p;
    if (!awaiting && !incoming) return null;
    const c = predictCrossing(this.ball, p, awaiting);
    return c ? { tick: this.tick + c.ticks, x: c.x, y: c.y, z: c.z } : null;
  }

  /** Posisi z titik pukul pemain, untuk penempatan bat di renderer. */
  static hitPlaneZ(p: Side): number {
    return p === 0 ? HIT_PLANE_Z : -HIT_PLANE_Z;
  }
}

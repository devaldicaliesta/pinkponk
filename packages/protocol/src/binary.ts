import type { MatchEvent, MatchPhase, PlayerInput, Side } from "@pinkponk/sim";

export const MSG_INPUT = 1;
export const MSG_PING = 2;
export const MSG_SNAPSHOT = 10;
export const MSG_PONG = 11;

/** Ukuran maksimum pesan masuk dari client (byte). */
export const MAX_CLIENT_MESSAGE = 256;

const PHASES: MatchPhase[] = ["countdown", "serve", "toss", "rally", "point", "over"];

export const encodeInput = (i: PlayerInput): ArrayBuffer => {
  const buf = new ArrayBuffer(21);
  const v = new DataView(buf);
  v.setUint8(0, MSG_INPUT);
  v.setUint32(1, Math.max(0, i.viewTick));
  v.setFloat32(5, i.x);
  v.setInt8(9, Math.round(i.aim * 127));
  v.setInt8(10, Math.round(i.lift * 127));
  v.setUint8(11, Math.round(i.power * 255));
  v.setUint8(12, (i.serve ? 1 : 0) | (i.tapMs !== null ? 2 : 0));
  v.setFloat64(13, i.tapMs ?? 0);
  return buf;
};

export const decodeInput = (buf: ArrayBuffer): PlayerInput | null => {
  if (buf.byteLength !== 21) return null;
  const v = new DataView(buf);
  if (v.getUint8(0) !== MSG_INPUT) return null;
  const flags = v.getUint8(12);
  return {
    viewTick: v.getUint32(1),
    x: v.getFloat32(5),
    aim: v.getInt8(9) / 127,
    lift: v.getInt8(10) / 127,
    power: v.getUint8(11) / 255,
    serve: (flags & 1) === 1,
    tapMs: (flags & 2) === 2 ? v.getFloat64(13) : null,
  };
};

export const encodePing = (clientMs: number): ArrayBuffer => {
  const buf = new ArrayBuffer(9);
  const v = new DataView(buf);
  v.setUint8(0, MSG_PING);
  v.setFloat64(1, clientMs);
  return buf;
};

export const decodePing = (buf: ArrayBuffer): number | null => {
  if (buf.byteLength !== 9) return null;
  const v = new DataView(buf);
  return v.getUint8(0) === MSG_PING ? v.getFloat64(1) : null;
};

export const encodePong = (clientMs: number, serverMs: number): ArrayBuffer => {
  const buf = new ArrayBuffer(17);
  const v = new DataView(buf);
  v.setUint8(0, MSG_PONG);
  v.setFloat64(1, clientMs);
  v.setFloat64(9, serverMs);
  return buf;
};

export interface Pong {
  clientMs: number;
  serverMs: number;
}

export const decodePong = (buf: ArrayBuffer): Pong | null => {
  if (buf.byteLength !== 17) return null;
  const v = new DataView(buf);
  if (v.getUint8(0) !== MSG_PONG) return null;
  return { clientMs: v.getFloat64(1), serverMs: v.getFloat64(9) };
};

export interface Snapshot {
  tick: number;
  phase: MatchPhase;
  phaseTick: number;
  server: Side;
  winner: Side | null;
  points: [number, number];
  games: [number, number];
  fever: [boolean, boolean];
  rallyHits: number;
  ball: { pos: Vec; vel: Vec; spin: Vec };
  bats: [number, number];
  events: MatchEvent[];
}

interface Vec {
  x: number;
  y: number;
  z: number;
}

const SHOTS = ["serve", "block", "drive", "smash", "lob", "weak"] as const;
const GRADES = ["perfect", "great", "good", "early", "late", "miss"] as const;
const REASONS = [
  "serve-fault",
  "own-side",
  "out",
  "net",
  "double-bounce",
  "miss",
  "timeout",
  "let",
] as const;
const EVENT_TYPES = [
  "bounce",
  "net",
  "floor",
  "toss",
  "hit",
  "judge",
  "point",
  "game",
  "match",
  "fever",
] as const;

const EVENT_SIZE = 12;
const MAX_EVENTS = 32;

// Tata letak snapshot (byte offset).
const O = {
  type: 0,
  tick: 1,
  phase: 5,
  phaseTick: 6,
  server: 10,
  winner: 11,
  fever: 12,
  points: 13,
  games: 15,
  rallyHits: 17,
  pos: 19,
  vel: 31,
  spin: 43,
  bats: 55,
  count: 63,
} as const;
const HEADER = 64;

const indexOf = <T>(list: readonly T[], v: T): number => Math.max(0, list.indexOf(v));

const encodeEvent = (v: DataView, o: number, e: MatchEvent): void => {
  v.setUint8(o, EVENT_TYPES.indexOf(e.type));
  let a = 0;
  let b = 0;
  let x = 0;
  let z = 0;
  switch (e.type) {
    case "bounce":
      a = e.side;
      x = e.x;
      z = e.z;
      break;
    case "toss":
      a = e.player;
      break;
    case "hit":
      a = e.player;
      b = indexOf(SHOTS, e.shot) | (e.grade ? (indexOf(GRADES, e.grade) + 1) << 4 : 0);
      break;
    case "judge":
      a = e.player;
      b = indexOf(GRADES, e.grade);
      break;
    case "point":
      a = e.winner;
      b = indexOf(REASONS, e.reason);
      break;
    case "game":
    case "match":
      a = e.winner;
      break;
    case "fever":
      a = e.player;
      b = e.on ? 1 : 0;
      break;
  }
  v.setUint8(o + 1, a);
  v.setUint8(o + 2, b);
  v.setUint8(o + 3, 0);
  v.setFloat32(o + 4, x);
  v.setFloat32(o + 8, z);
};

const decodeEvent = (v: DataView, o: number): MatchEvent | null => {
  const type = EVENT_TYPES[v.getUint8(o)];
  const a = (v.getUint8(o + 1) & 1) as Side;
  const b = v.getUint8(o + 2);
  switch (type) {
    case "bounce":
      return { type, side: a, x: v.getFloat32(o + 4), z: v.getFloat32(o + 8) };
    case "net":
    case "floor":
      return { type };
    case "toss":
      return { type, player: a };
    case "hit": {
      const grade = b >> 4;
      return {
        type,
        player: a,
        shot: SHOTS[b & 15] ?? "drive",
        grade: grade > 0 ? (GRADES[grade - 1] ?? null) : null,
      };
    }
    case "judge":
      return { type, player: a, grade: GRADES[b] ?? "miss" };
    case "point":
      return { type, winner: a, reason: REASONS[b] ?? "out" };
    case "game":
    case "match":
      return { type, winner: a };
    case "fever":
      return { type, player: a, on: b === 1 };
    default:
      return null;
  }
};

const writeVec = (v: DataView, o: number, p: Vec): void => {
  v.setFloat32(o, p.x);
  v.setFloat32(o + 4, p.y);
  v.setFloat32(o + 8, p.z);
};

const readVec = (v: DataView, o: number): Vec => ({
  x: v.getFloat32(o),
  y: v.getFloat32(o + 4),
  z: v.getFloat32(o + 8),
});

export const encodeSnapshot = (s: Snapshot): ArrayBuffer => {
  const events = s.events.slice(-MAX_EVENTS);
  const buf = new ArrayBuffer(HEADER + events.length * EVENT_SIZE);
  const v = new DataView(buf);
  v.setUint8(O.type, MSG_SNAPSHOT);
  v.setUint32(O.tick, s.tick);
  v.setUint8(O.phase, PHASES.indexOf(s.phase));
  v.setUint32(O.phaseTick, s.phaseTick);
  v.setUint8(O.server, s.server);
  v.setUint8(O.winner, s.winner === null ? 255 : s.winner);
  v.setUint8(O.fever, (s.fever[0] ? 1 : 0) | (s.fever[1] ? 2 : 0));
  v.setUint8(O.points, s.points[0]);
  v.setUint8(O.points + 1, s.points[1]);
  v.setUint8(O.games, s.games[0]);
  v.setUint8(O.games + 1, s.games[1]);
  v.setUint16(O.rallyHits, Math.min(65535, s.rallyHits));
  writeVec(v, O.pos, s.ball.pos);
  writeVec(v, O.vel, s.ball.vel);
  writeVec(v, O.spin, s.ball.spin);
  v.setFloat32(O.bats, s.bats[0]);
  v.setFloat32(O.bats + 4, s.bats[1]);
  v.setUint8(O.count, events.length);
  events.forEach((e, i) => {
    encodeEvent(v, HEADER + i * EVENT_SIZE, e);
  });
  return buf;
};

export const decodeSnapshot = (buf: ArrayBuffer): Snapshot | null => {
  if (buf.byteLength < HEADER) return null;
  const v = new DataView(buf);
  if (v.getUint8(O.type) !== MSG_SNAPSHOT) return null;
  const count = v.getUint8(O.count);
  if (buf.byteLength !== HEADER + count * EVENT_SIZE) return null;
  const winner = v.getUint8(O.winner);
  const fever = v.getUint8(O.fever);
  const events: MatchEvent[] = [];
  for (let i = 0; i < count; i++) {
    const e = decodeEvent(v, HEADER + i * EVENT_SIZE);
    if (e) events.push(e);
  }
  return {
    tick: v.getUint32(O.tick),
    phase: PHASES[v.getUint8(O.phase)] ?? "serve",
    phaseTick: v.getUint32(O.phaseTick),
    server: (v.getUint8(O.server) & 1) as Side,
    winner: winner === 255 ? null : ((winner & 1) as Side),
    fever: [(fever & 1) === 1, (fever & 2) === 2],
    points: [v.getUint8(O.points), v.getUint8(O.points + 1)],
    games: [v.getUint8(O.games), v.getUint8(O.games + 1)],
    rallyHits: v.getUint16(O.rallyHits),
    ball: { pos: readVec(v, O.pos), vel: readVec(v, O.vel), spin: readVec(v, O.spin) },
    bats: [v.getFloat32(O.bats), v.getFloat32(O.bats + 4)],
    events,
  };
};

export const messageType = (buf: ArrayBuffer): number =>
  buf.byteLength > 0 ? new DataView(buf).getUint8(0) : -1;

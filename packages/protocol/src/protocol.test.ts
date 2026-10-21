import { describe, expect, it } from "vitest";
import {
  decodeInput,
  decodePing,
  decodePong,
  decodeSnapshot,
  encodeInput,
  encodePing,
  encodePong,
  encodeSnapshot,
  type Snapshot,
} from "./binary";
import {
  isRoomCode,
  PROTOCOL_VERSION,
  parseClientControl,
  parseQueueClient,
  roomCodeFromBytes,
} from "./control";

const snapshot: Snapshot = {
  tick: 12345,
  phase: "rally",
  phaseTick: 12000,
  server: 1,
  winner: null,
  points: [7, 10],
  games: [1, 0],
  fever: [false, true],
  rallyHits: 9,
  ball: {
    pos: { x: 0.5, y: 0.25, z: -1 },
    vel: { x: 1, y: 2, z: -8 },
    spin: { x: 90, y: 0, z: -3 },
  },
  bats: [0.25, -0.5],
  gamble: [
    { stack: 4, ability: null, pointsLeft: 0, armed: false },
    { stack: 0, ability: "jackpot", pointsLeft: 2, armed: true },
  ],
  events: [
    { type: "bounce", side: 1, x: 0.5, z: -0.75 },
    { type: "hit", player: 0, shot: "smash", grade: "perfect" },
    { type: "hit", player: 1, shot: "drive", grade: null },
    { type: "judge", player: 1, grade: "late" },
    { type: "point", winner: 0, reason: "double-bounce" },
    { type: "fever", player: 1, on: true },
    { type: "net" },
    { type: "ability", player: 1, ability: "freeze", points: 2 },
    { type: "shield", player: 0 },
  ],
};

describe("protokol biner", () => {
  it("snapshot round-trip", () => {
    expect(decodeSnapshot(encodeSnapshot(snapshot))).toEqual(snapshot);
  });

  it("snapshot dengan pemenang", () => {
    const s = { ...snapshot, winner: 0 as const, phase: "over" as const, events: [] };
    expect(decodeSnapshot(encodeSnapshot(s))).toEqual(s);
  });

  it("input round-trip (nilai dikuantisasi)", () => {
    const out = decodeInput(
      encodeInput({
        viewTick: 99,
        x: 0.5,
        aim: -1,
        lift: 0.5,
        power: 1,
        serve: true,
        tapMs: 812.5,
        ability: true,
      }),
    );
    expect(out).toMatchObject({
      viewTick: 99,
      x: 0.5,
      aim: -1,
      power: 1,
      serve: true,
      tapMs: 812.5,
      ability: true,
    });
    expect(out?.lift).toBeCloseTo(0.5, 1);
  });

  it("input tanpa tap", () => {
    const out = decodeInput(
      encodeInput({
        viewTick: 1,
        x: 0,
        aim: 0,
        lift: 0,
        power: 0,
        serve: false,
        tapMs: null,
        ability: false,
      }),
    );
    expect(out?.tapMs).toBeNull();
    expect(out?.ability).toBe(false);
  });

  it("menolak pesan dengan panjang salah", () => {
    expect(decodeInput(new ArrayBuffer(5))).toBeNull();
    expect(decodeSnapshot(new ArrayBuffer(70))).toBeNull();
    expect(decodeSnapshot(new ArrayBuffer(73))).toBeNull();
    expect(decodePing(new ArrayBuffer(3))).toBeNull();
  });

  it("ping/pong", () => {
    expect(decodePing(encodePing(1234.5))).toBe(1234.5);
    expect(decodePong(encodePong(1, 2))).toEqual({ clientMs: 1, serverMs: 2 });
  });
});

describe("pesan kontrol", () => {
  it("hello sah (client lama tanpa versi dan gamble tetap terbaca)", () => {
    const msg = JSON.stringify({
      t: "hello",
      nick: "Rara",
      create: true,
      config: { mode: "timing", bestOf: 3 },
    });
    expect(parseClientControl(msg)).toEqual({
      t: "hello",
      v: 0,
      nick: "Rara",
      create: true,
      config: { mode: "timing", bestOf: 3, gamble: false },
      token: null,
      player: null,
    });
  });

  it("hello lengkap dengan rahasia pemain", () => {
    const secret = "ab".repeat(32);
    const msg = JSON.stringify({
      t: "hello",
      v: PROTOCOL_VERSION,
      nick: "Rara",
      create: false,
      config: { mode: "swing", bestOf: 5, gamble: true },
      token: "0".repeat(32),
      player: secret,
    });
    expect(parseClientControl(msg)).toMatchObject({
      v: PROTOCOL_VERSION,
      config: { gamble: true },
      player: secret,
    });
  });

  it("rahasia pemain yang tidak sah diabaikan", () => {
    const msg = JSON.stringify({
      t: "hello",
      nick: "Rara",
      create: true,
      config: { mode: "swing", bestOf: 1 },
      player: "ZZ".repeat(32),
    });
    expect(parseClientControl(msg)?.t === "hello" && parseClientControl(msg)).toMatchObject({
      player: null,
    });
  });

  it.each([
    "bukan json",
    "[]",
    JSON.stringify({ t: "hello", nick: 5, create: true, config: { mode: "swing", bestOf: 3 } }),
    JSON.stringify({ t: "hello", nick: "a", create: true, config: { mode: "x", bestOf: 3 } }),
    JSON.stringify({ t: "hello", nick: "a", create: true, config: { mode: "swing", bestOf: 2 } }),
    JSON.stringify({ t: "emoji", e: 99 }),
    JSON.stringify({ t: "admin" }),
    JSON.stringify({ t: "hello", nick: "x".repeat(400) }),
  ])("menolak %s", (msg) => {
    expect(parseClientControl(msg)).toBeNull();
  });

  it("kode room hanya memakai alfabet aman", () => {
    const code = roomCodeFromBytes(new Uint8Array([0, 30, 31, 200, 255, 7]));
    expect(isRoomCode(code)).toBe(true);
    expect(isRoomCode("ABCDE0")).toBe(false);
    expect(isRoomCode("abcdef")).toBe(false);
  });
});

describe("pesan antrean", () => {
  it("menerima permintaan antrean sah", () => {
    expect(
      parseQueueClient(JSON.stringify({ t: "queue", v: 2, mode: "swing", gamble: true })),
    ).toEqual({ t: "queue", v: 2, mode: "swing", gamble: true });
  });

  it.each(["{}", JSON.stringify({ t: "queue", mode: "x" }), "x".repeat(400)])(
    "menolak %s",
    (msg) => {
      expect(parseQueueClient(msg)).toBeNull();
    },
  );
});

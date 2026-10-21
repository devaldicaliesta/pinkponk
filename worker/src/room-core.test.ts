import {
  decodeSnapshot,
  encodeInput,
  encodePing,
  MSG_SNAPSHOT,
  messageType,
  type ServerControl,
} from "@pinkponk/protocol";
import { emptyInput, MS_PER_TICK } from "@pinkponk/sim";
import { beforeEach, describe, expect, it } from "vitest";
import { type Conn, RECONNECT_GRACE_MS, RoomCore } from "./room-core";

class FakeConn implements Conn {
  sent: (string | ArrayBuffer)[] = [];
  closed: { code: number; reason: string } | null = null;
  constructor(readonly id: string) {}
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close(code: number, reason: string) {
    this.closed = { code, reason };
  }
  controls(): ServerControl[] {
    return this.sent.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d));
  }
  last<T extends ServerControl["t"]>(t: T) {
    return this.controls()
      .filter((c): c is Extract<ServerControl, { t: T }> => c.t === t)
      .at(-1);
  }
  snapshots() {
    return this.sent
      .filter((d): d is ArrayBuffer => typeof d !== "string" && messageType(d) === MSG_SNAPSHOT)
      .map((d) => decodeSnapshot(d)!);
  }
}

const hello = (nick: string, create: boolean, token: string | null = null) =>
  JSON.stringify({ t: "hello", nick, create, config: { mode: "swing", bestOf: 1 }, token });

let clock = 0;
let tokenN = 0;
const makeRoom = () =>
  new RoomCore("ABC234", {
    now: () => clock,
    randomSeed: () => 42,
    randomToken: () => (tokenN++).toString(16).padStart(32, "0"),
  });

const join = (room: RoomCore, id: string, nick: string, create: boolean) => {
  const c = new FakeConn(id);
  room.open(c);
  room.message(c, hello(nick, create));
  return c;
};

const advance = (room: RoomCore, ms: number) => {
  for (let t = 0; t < ms; t += 16) {
    clock += 16;
    room.tick();
  }
};

describe("RoomCore", () => {
  beforeEach(() => {
    clock = 1_000;
    tokenN = 1;
  });

  it("menolak bergabung ke room yang belum dibuat", () => {
    const room = makeRoom();
    const c = join(room, "a", "Rara", false);
    expect(c.last("error")?.code).toBe("not-found");
    expect(c.closed?.code).toBe(1008);
  });

  it("pembuat mendapat kursi 0, pemain kedua kursi 1, lalu pertandingan mulai", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    expect(a.last("welcome")?.you).toBe(0);
    expect(room.status).toBe("lobby");
    const b = join(room, "b", "Budi", false);
    expect(b.last("welcome")?.you).toBe(1);
    expect(room.status).toBe("playing");
    expect(a.last("start")?.players).toEqual(["Rara", "Budi"]);
  });

  it("nickname kembar diberi akhiran", () => {
    const room = makeRoom();
    join(room, "a", "Rara", true);
    const b = join(room, "b", "Rara", false);
    expect(b.last("start")?.players).toEqual(["Rara", "Rara#2"]);
  });

  it("menolak nickname tidak sah dan room penuh", () => {
    const room = makeRoom();
    const bad = join(room, "x", "<b>hi</b>", true);
    expect(bad.last("error")?.code).toBe("bad-nickname");
    join(room, "a", "Rara", true);
    join(room, "b", "Budi", false);
    const c = join(room, "c", "Caca", false);
    expect(c.last("error")?.code).toBe("full");
  });

  it("mengirim snapshot ±30 kali per detik saat bermain", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    join(room, "b", "Budi", false);
    advance(room, 1000);
    const n = a.snapshots().length;
    expect(n).toBeGreaterThanOrEqual(28);
    expect(n).toBeLessThanOrEqual(32);
  });

  it("menjawab ping dengan waktu server", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    join(room, "b", "Budi", false);
    advance(room, 500);
    room.message(a, encodePing(123));
    const pong = a.sent.at(-1) as ArrayBuffer;
    const v = new DataView(pong);
    expect(v.getFloat64(1)).toBe(123);
    expect(v.getFloat64(9)).toBeGreaterThan(400);
  });

  it("input pemain diteruskan ke simulasi", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    join(room, "b", "Budi", false);
    advance(room, 100);
    room.message(a, encodeInput({ ...emptyInput(room.match!.tick), x: 0.8 }));
    advance(room, 500);
    expect(room.match!.players[0].batX).toBeCloseTo(0.8);
  });

  it("putus koneksi menjeda pertandingan, sambung ulang dengan token melanjutkan", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    const b = join(room, "b", "Budi", false);
    const token = b.last("welcome")!.token;
    advance(room, 200);
    room.close(b);
    expect(room.status).toBe("paused");
    expect(a.last("paused")?.player).toBe(1);
    const tickAtPause = room.match!.tick;
    advance(room, 5000);
    expect(room.match!.tick).toBe(tickAtPause);
    const b2 = new FakeConn("b2");
    room.open(b2);
    room.message(b2, hello("Budi", false, token));
    expect(b2.last("welcome")?.you).toBe(1);
    expect(room.status).toBe("playing");
    advance(room, 200);
    expect(room.match!.tick).toBeGreaterThan(tickAtPause);
    expect(room.match!.tick - tickAtPause).toBeLessThan(Math.ceil(300 / MS_PER_TICK));
  });

  it("putus lebih dari 30 detik = kalah WO", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    const b = join(room, "b", "Budi", false);
    advance(room, 200);
    room.close(b);
    advance(room, RECONNECT_GRACE_MS + 100);
    expect(room.status).toBe("over");
    expect(a.snapshots().at(-1)?.winner).toBe(0);
  });

  it("rematch dimulai setelah kedua pemain setuju", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    const b = join(room, "b", "Budi", false);
    room.match!.forfeit(1);
    room.tick();
    expect(room.status).toBe("over");
    room.message(a, JSON.stringify({ t: "rematch" }));
    expect(room.status).toBe("over");
    room.message(b, JSON.stringify({ t: "rematch" }));
    expect(room.status).toBe("playing");
  });

  it("memutus koneksi yang mengirim pesan rusak atau terlalu besar", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    room.message(a, new ArrayBuffer(400));
    expect(a.closed?.reason).toBe("bad-message");
    const b = new FakeConn("b");
    room.open(b);
    room.message(b, "{bukan json");
    expect(b.closed?.reason).toBe("bad-message");
  });

  it("memutus koneksi yang membanjiri pesan", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    for (let i = 0; i < 100; i++) room.message(a, encodePing(i));
    expect(a.closed?.reason).toBe("rate-limited");
  });

  it("room kosong setelah semua keluar dari lobby", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    room.close(a);
    expect(room.exists).toBe(false);
  });
});

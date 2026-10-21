import {
  decodeSnapshot,
  encodeInput,
  encodePing,
  MSG_SNAPSHOT,
  messageType,
  PROTOCOL_VERSION,
  type ServerControl,
} from "@pinkponk/protocol";
import { emptyInput, MS_PER_TICK } from "@pinkponk/sim";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type Conn,
  HELLO_TIMEOUT_MS,
  IDLE_MATCH_MS,
  MAX_CONNS,
  type MatchResult,
  MIN_RATED_POINTS,
  RECONNECT_GRACE_MS,
  RoomCore,
} from "./room-core";

class FakeConn implements Conn {
  sent: (string | ArrayBuffer)[] = [];
  closed: { code: number; reason: string } | null = null;
  constructor(
    readonly id: string,
    readonly origin?: string,
  ) {}
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

const hello = (
  nick: string,
  create: boolean,
  token: string | null = null,
  extra: Record<string, unknown> = {},
) =>
  JSON.stringify({
    t: "hello",
    v: PROTOCOL_VERSION,
    nick,
    create,
    config: { mode: "swing", bestOf: 1 },
    token,
    ...extra,
  });

let clock = 0;
let tokenN = 0;
let reports: MatchResult[] = [];
const makeRoom = () =>
  new RoomCore("ABC234", {
    now: () => clock,
    randomSeed: () => 42,
    randomToken: () => (tokenN++).toString(16).padStart(32, "0"),
    reportResult: (r) => reports.push(r),
  });

const join = (
  room: RoomCore,
  id: string,
  nick: string,
  create: boolean,
  extra: Record<string, unknown> = {},
  origin?: string,
) => {
  const c = new FakeConn(id, origin);
  room.open(c);
  room.message(c, hello(nick, create, null, extra));
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
    reports = [];
  });

  it("menolak client dengan versi protokol lama", () => {
    const room = makeRoom();
    const c = new FakeConn("old");
    room.open(c);
    room.message(
      c,
      JSON.stringify({
        t: "hello",
        nick: "Rara",
        create: true,
        config: { mode: "swing", bestOf: 1 },
      }),
    );
    expect(c.last("error")?.code).toBe("outdated");
    expect(room.exists).toBe(false);
  });

  it("mode gamble diteruskan ke simulasi dan status stack ada di snapshot", () => {
    const room = makeRoom();
    const gambleCfg = { config: { mode: "swing", bestOf: 1, gamble: true } };
    const a = join(room, "a", "Rara", true, gambleCfg);
    join(room, "b", "Budi", false, gambleCfg);
    expect(room.match?.config.gamble).toBe(true);
    room.match!.players[1].gamble.stack = 4;
    advance(room, 200);
    expect(a.snapshots().at(-1)?.gamble[1].stack).toBe(4);
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

describe("RoomCore — jeda dan koneksi diam", () => {
  beforeEach(() => {
    clock = 1_000;
    tokenN = 1;
  });

  const startedRoom = () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    const b = join(room, "b", "Budi", false);
    return { room, a, b };
  };

  /** Jaga kedua koneksi tetap "hidup" dengan ping, seperti klien sungguhan. */
  const advanceAlive = (room: RoomCore, conns: FakeConn[], ms: number) => {
    for (let t = 0; t < ms; t += 500) {
      for (const c of conns) room.message(c, encodePing(t));
      advance(room, 500);
    }
  };

  it("pemain yang diam lebih dari 5 detik dianggap terputus", () => {
    const { room, a, b } = startedRoom();
    for (let t = 0; t < 6000; t += 500) {
      room.message(a, encodePing(t));
      advance(room, 500);
    }
    expect(b.closed?.reason).toBe("silent");
    expect(room.status).toBe("paused");
    expect(a.last("paused")?.reason).toBe("disconnect");
  });

  it("pemain bisa meminta jeda, simulasi berhenti, lalu lanjut", () => {
    const { room, a, b } = startedRoom();
    advanceAlive(room, [a, b], 1000);
    room.message(a, JSON.stringify({ t: "pause" }));
    expect(room.status).toBe("paused");
    expect(b.last("paused")).toMatchObject({ player: 0, reason: "request", pausesLeft: [1, 2] });
    const tick = room.match!.tick;
    advanceAlive(room, [a, b], 3000);
    expect(room.match!.tick).toBe(tick);
    room.message(b, JSON.stringify({ t: "resume" }));
    expect(room.status).toBe("playing");
    advanceAlive(room, [a, b], 500);
    expect(room.match!.tick - tick).toBeLessThan(Math.ceil(700 / MS_PER_TICK));
  });

  it("jatah jeda terbatas dan jeda berakhir otomatis setelah 60 detik", () => {
    const { room, a, b } = startedRoom();
    for (let i = 0; i < 2; i++) {
      room.message(a, JSON.stringify({ t: "pause" }));
      room.message(a, JSON.stringify({ t: "resume" }));
    }
    room.message(a, JSON.stringify({ t: "pause" }));
    expect(room.status).toBe("playing");
    room.message(b, JSON.stringify({ t: "pause" }));
    expect(room.status).toBe("paused");
    advanceAlive(room, [a, b], 61_000);
    expect(room.status).toBe("playing");
  });
});

describe("RoomCore — hasil untuk leaderboard", () => {
  beforeEach(() => {
    clock = 1_000;
    tokenN = 1;
    reports = [];
  });

  const secretA = "a".repeat(64);
  const secretB = "b".repeat(64);

  it("pertandingan penuh antara dua pemain berbeda dilaporkan sekali", () => {
    const room = makeRoom();
    join(room, "a", "Rara", true, { player: secretA }, "1.1.1.1");
    join(room, "b", "Budi", false, { player: secretB }, "2.2.2.2");
    (room as unknown as { pointsPlayed: number }).pointsPlayed = MIN_RATED_POINTS;
    room.match!.forfeit(1);
    room.tick();
    room.tick();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      winner: { secret: secretA, nick: "Rara" },
      loser: { secret: secretB, nick: "Budi" },
    });
  });

  it("tidak dilaporkan bila terlalu pendek, tanpa rahasia, atau dari jaringan yang sama", () => {
    const cases: [Record<string, unknown>, Record<string, unknown>, string, string, number][] = [
      [{ player: secretA }, { player: secretB }, "1.1.1.1", "2.2.2.2", 1],
      [{ player: secretA }, {}, "1.1.1.1", "2.2.2.2", MIN_RATED_POINTS],
      [{ player: secretA }, { player: secretA }, "1.1.1.1", "2.2.2.2", MIN_RATED_POINTS],
      [{ player: secretA }, { player: secretB }, "9.9.9.9", "9.9.9.9", MIN_RATED_POINTS],
    ];
    for (const [ea, eb, oa, ob, pts] of cases) {
      const room = makeRoom();
      join(room, "a", "Rara", true, ea, oa);
      join(room, "b", "Budi", false, eb, ob);
      (room as unknown as { pointsPlayed: number }).pointsPlayed = pts;
      room.match!.forfeit(1);
      room.tick();
    }
    expect(reports).toHaveLength(0);
  });

  it("menghitung poin yang dimainkan dari simulasi", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true, { player: secretA }, "1.1.1.1");
    const b = join(room, "b", "Budi", false, { player: secretB }, "2.2.2.2");
    // Pemain 1 menjauhkan bat: servis otomatis pemain 0 selalu menghasilkan poin.
    for (let t = 0; t < 40_000; t += 500) {
      room.message(a, encodePing(t));
      room.message(b, encodeInput({ ...emptyInput(room.match!.tick), x: 1.1 }));
      advance(room, 500);
    }
    expect((room as unknown as { pointsPlayed: number }).pointsPlayed).toBeGreaterThan(2);
  });
});

describe("RoomCore — perlindungan beban", () => {
  beforeEach(() => {
    clock = 1_000;
    tokenN = 1;
    reports = [];
  });

  it("koneksi berlebih ke satu room ditolak", () => {
    const room = makeRoom();
    const conns = Array.from({ length: MAX_CONNS + 3 }, (_, i) => new FakeConn(`c${i}`));
    const accepted = conns.map((c) => room.open(c)).filter(Boolean).length;
    expect(accepted).toBe(MAX_CONNS);
    expect(conns.at(-1)?.closed?.reason).toBe("busy");
  });

  it("koneksi yang tidak mengirim hello ditutup setelah batas waktu", () => {
    const room = makeRoom();
    const idle = new FakeConn("idle");
    room.open(idle);
    const a = join(room, "a", "Rara", true);
    clock += HELLO_TIMEOUT_MS + 1;
    room.sweepIdle();
    expect(idle.closed?.reason).toBe("idle");
    expect(a.closed).toBeNull();
    // Slot koneksi kembali tersedia.
    expect(room.open(new FakeConn("baru"))).toBe(true);
  });

  it("dua pemain yang menganggur lama dihentikan tanpa peringkat", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    const b = join(room, "b", "Budi", false);
    // Koneksi tetap hidup (ping) tetapi kontrol tidak pernah disentuh.
    for (let t = 0; t <= IDLE_MATCH_MS + 1000; t += 1000) {
      room.message(a, encodePing(t));
      room.message(b, encodePing(t));
      advance(room, 1000);
    }
    expect(a.last("error")?.code).toBe("idle");
    expect(b.closed?.reason).toBe("idle");
    expect(room.exists).toBe(false);
    expect(reports).toHaveLength(0);
  });

  it("pemain yang aktif tidak dianggap menganggur", () => {
    const room = makeRoom();
    const a = join(room, "a", "Rara", true);
    const b = join(room, "b", "Budi", false);
    for (let t = 0; t <= IDLE_MATCH_MS + 1000; t += 1000) {
      room.message(
        a,
        encodeInput({ ...emptyInput(room.match!.tick), x: (t / 1000) % 2 ? 0.5 : -0.5 }),
      );
      room.message(b, encodePing(t));
      advance(room, 1000);
    }
    expect(room.status).not.toBe("over");
    expect(a.closed).toBeNull();
  });
});

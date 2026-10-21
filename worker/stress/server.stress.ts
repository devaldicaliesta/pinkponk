// Uji beban server tanpa jaringan: ratusan room sekaligus, klien jahil, antrean besar,
// leaderboard ramai, dan fuzz protokol. Jalankan: pnpm test:stress
import {
  decodeInput,
  decodePing,
  decodeSnapshot,
  encodeInput,
  encodePing,
  MSG_SNAPSHOT,
  messageType,
  PROTOCOL_VERSION,
  parseClientControl,
  parseQueueClient,
  type QueueServer,
} from "@pinkponk/protocol";
import { createRng, emptyInput, nextFloat, sanitizeInput } from "@pinkponk/sim";
import { describe, expect, it } from "vitest";
import {
  LeaderboardCore,
  type LeaderboardStore,
  PAIR_LIMIT_PER_DAY,
  type PlayerRow,
} from "../src/leaderboard-core";
import { MAX_QUEUE, MatchmakerCore } from "../src/matchmaker-core";
import { type Conn, RoomCore } from "../src/room-core";

const ROOMS = Number(process.env.STRESS_ROOMS ?? 200);
const SECONDS = Number(process.env.STRESS_SECONDS ?? 30);

class BotConn implements Conn {
  snapshots = 0;
  closed: string | null = null;
  constructor(
    readonly id: string,
    readonly origin?: string,
  ) {}
  send(data: string | ArrayBuffer) {
    if (typeof data !== "string" && messageType(data) === MSG_SNAPSHOT) this.snapshots++;
  }
  close(_code: number, reason: string) {
    this.closed = reason;
  }
}

const hello = (nick: string, create: boolean, gamble: boolean) =>
  JSON.stringify({
    t: "hello",
    v: PROTOCOL_VERSION,
    nick,
    create,
    config: { mode: "swing", bestOf: 3, gamble },
    token: null,
    player: null,
  });

describe("stress: room online", () => {
  it(`${ROOMS} room bermain bersamaan selama ${SECONDS} dtk tanpa error dan cukup ringan`, async () => {
    let clock = 0;
    const rng = createRng(99);
    const rooms = Array.from({ length: ROOMS }, (_, i) => {
      const room = new RoomCore(`R${i}`, {
        now: () => clock,
        randomSeed: () => i + 1,
        randomToken: () => i.toString(16).padStart(32, "0"),
      });
      const a = new BotConn(`a${i}`, `10.0.${i}.1`);
      const b = new BotConn(`b${i}`, `10.1.${i}.1`);
      room.open(a);
      room.open(b);
      room.message(a, hello(`Bot${i}a`, true, i % 2 === 0));
      room.message(b, hello(`Bot${i}b`, false, i % 2 === 0));
      return { room, a, b };
    });
    expect(rooms.every((r) => r.room.status === "playing")).toBe(true);

    const started = performance.now();
    // Server men-tick ±60 Hz; klien mengirim input 30 Hz dan ping tiap 2 detik.
    for (let ms = 0; ms < SECONDS * 1000; ms += 1000 / 60) {
      clock = ms;
      if (Math.floor(ms / 1000) !== Math.floor((ms - 16.7) / 1000))
        await new Promise((r) => setTimeout(r, 0));
      const sendInput = Math.floor(ms / 33.3) !== Math.floor((ms - 16.7) / 33.3);
      const ping = Math.floor(ms / 2000) !== Math.floor((ms - 16.7) / 2000);
      for (const r of rooms) {
        const m = r.room.match;
        if (!m) continue;
        for (const c of [r.a, r.b]) {
          if (sendInput) {
            const input = {
              ...emptyInput(m.tick),
              x: (nextFloat(rng) - 0.5) * 2,
              power: nextFloat(rng),
            };
            input.ability = nextFloat(rng) < 0.01;
            r.room.message(c, encodeInput(input));
          }
          if (ping) r.room.message(c, encodePing(ms));
        }
        r.room.tick();
      }
    }
    const cpuMs = performance.now() - started;
    const perRoomPerSecond = cpuMs / ROOMS / SECONDS;
    const closed = rooms.filter((r) => r.a.closed || r.b.closed).length;
    const snapRate = rooms.reduce((s, r) => s + r.a.snapshots, 0) / ROOMS / SECONDS;
    console.log(
      `[stress] ${ROOMS} room × ${SECONDS} dtk: ${cpuMs.toFixed(0)} ms CPU total, ` +
        `${perRoomPerSecond.toFixed(2)} ms CPU per room per detik, ${snapRate.toFixed(1)} snapshot/dtk per klien`,
    );
    expect(closed).toBe(0);
    expect(snapRate).toBeGreaterThan(25);
    // Satu Durable Object per room: biaya CPU satu room harus jauh di bawah 1 detik per detik.
    expect(perRoomPerSecond).toBeLessThan(50);
  });

  it("klien yang membanjiri pesan diputus tanpa mengganggu lawannya", () => {
    let clock = 0;
    const room = new RoomCore("FLOOD", {
      now: () => clock,
      randomSeed: () => 1,
      randomToken: () => "f".repeat(32),
    });
    const bad = new BotConn("bad", "1.1.1.1");
    const good = new BotConn("good", "2.2.2.2");
    room.open(bad);
    room.open(good);
    room.message(bad, hello("Jahil", true, false));
    room.message(good, hello("Baik", false, false));
    for (let i = 0; i < 5000; i++) room.message(bad, encodePing(i));
    expect(bad.closed).toBe("rate-limited");
    expect(good.closed).toBeNull();
    for (let ms = 0; ms < 2000; ms += 16) {
      clock += 16;
      if (ms % 500 === 0) room.message(good, encodePing(ms));
      room.tick();
    }
    // Lawan tidak diputus; pertandingan dijeda menunggu si penyerang (atau menang WO).
    expect(good.closed).toBeNull();
    expect(room.status).toBe("paused");
  });

  it("serbuan koneksi ke satu room dibatasi", () => {
    const room = new RoomCore("SWARM", {
      now: () => 0,
      randomSeed: () => 1,
      randomToken: () => "0".repeat(32),
    });
    const accepted = Array.from({ length: 1000 }, (_, i) => room.open(new BotConn(`s${i}`))).filter(
      Boolean,
    ).length;
    expect(accepted).toBeLessThanOrEqual(6);
  });
});

describe("stress: antrean cari lawan", () => {
  it("10.000 permintaan acak: pasangan selalu satu mode, tidak ada tiket ganda", () => {
    let clock = 0;
    const matched = new Map<string, string>();
    const keyOf = new Map<string, string>();
    const mm = new MatchmakerCore({
      now: () => clock,
      newRoomCode: (() => {
        let n = 0;
        return () => `C${n++}`;
      })(),
      send: (id: string, msg: QueueServer) => {
        if (msg.t === "matched") {
          expect(matched.has(id)).toBe(false);
          matched.set(id, msg.code);
        }
      },
      close: () => {},
      remember: () => {},
    });
    const rng = createRng(5);
    const started = performance.now();
    for (let i = 0; i < 10_000; i++) {
      clock += 5;
      const mode = nextFloat(rng) < 0.5 ? "swing" : "timing";
      const gamble = nextFloat(rng) < 0.5;
      keyOf.set(`p${i}`, `${mode}${gamble}`);
      mm.message(`p${i}`, JSON.stringify({ t: "queue", v: PROTOCOL_VERSION, mode, gamble }));
      if (nextFloat(rng) < 0.1) mm.leave(`p${Math.floor(nextFloat(rng) * i)}`);
      expect(mm.size).toBeLessThanOrEqual(MAX_QUEUE);
    }
    const byCode = new Map<string, string[]>();
    for (const [id, code] of matched) byCode.set(code, [...(byCode.get(code) ?? []), id]);
    for (const ids of byCode.values()) {
      expect(ids).toHaveLength(2);
      expect(keyOf.get(ids[0]!)).toBe(keyOf.get(ids[1]!));
    }
    console.log(
      `[stress] antrean: 10.000 permintaan, ${byCode.size} pasangan, ${(performance.now() - started).toFixed(0)} ms`,
    );
    expect(byCode.size).toBeGreaterThan(4000);
  });
});

class MemoryStore implements LeaderboardStore {
  players = new Map<string, PlayerRow>();
  pairs: { a: string; b: string; ts: number }[] = [];
  get(id: string) {
    return this.players.get(id) ?? null;
  }
  put(row: PlayerRow) {
    this.players.set(row.id, { ...row });
  }
  top(limit: number) {
    return [...this.players.values()].sort((x, y) => y.rating - x.rating).slice(0, limit);
  }
  countAbove(rating: number) {
    let n = 0;
    for (const p of this.players.values()) if (p.rating > rating) n++;
    return n;
  }
  pairCount(a: string, b: string, since: number) {
    return this.pairs.filter((p) => p.a === a && p.b === b && p.ts >= since).length;
  }
  addPair(a: string, b: string, ts: number) {
    this.pairs.push({ a, b, ts });
  }
  prune(pairsBefore: number) {
    if (this.pairs.length && this.pairs[0]!.ts < pairsBefore) {
      this.pairs = this.pairs.filter((p) => p.ts >= pairsBefore);
    }
  }
}

describe("stress: leaderboard", () => {
  it("20.000 hasil pertandingan: batas pasangan dipatuhi dan urutan tetap benar", () => {
    const core = new LeaderboardCore(new MemoryStore());
    const rng = createRng(7);
    const id = (n: number) => n.toString(16).padStart(32, "0");
    let rated = 0;
    let limited = 0;
    for (let i = 0; i < 20_000; i++) {
      // Sebagian kecil pemain "farming" melawan pasangan yang sama berulang-ulang.
      const farm = nextFloat(rng) < 0.2;
      const a = farm ? 1 : 2 + Math.floor(nextFloat(rng) * 500);
      let b = farm ? 2 : 2 + Math.floor(nextFloat(rng) * 500);
      if (a === b) b = a + 1;
      const r = core.report(
        { winnerId: id(a), winnerName: `P${a}`, loserId: id(b), loserName: `P${b}` },
        i * 1000,
      );
      if (r === "rated") rated++;
      if (r === "pair-limit") limited++;
    }
    const top = core.top();
    for (let i = 1; i < top.length; i++)
      expect(top[i - 1]!.rating).toBeGreaterThanOrEqual(top[i]!.rating);
    console.log(`[stress] leaderboard: ${rated} dihitung, ${limited} ditolak batas pasangan`);
    // ~20% laporan farming hanya boleh dihitung PAIR_LIMIT_PER_DAY kali per hari simulasi.
    expect(limited).toBeGreaterThan(3000);
    expect(rated).toBeGreaterThan(15_000 - PAIR_LIMIT_PER_DAY * 10);
  });
});

describe("stress: fuzz protokol", () => {
  it("100.000 pesan acak tidak pernah membuat parser melempar error", () => {
    const rng = createRng(3);
    const randomBytes = () => {
      const len = Math.floor(nextFloat(rng) * 120);
      const buf = new Uint8Array(len);
      for (let i = 0; i < len; i++) buf[i] = Math.floor(nextFloat(rng) * 256);
      // Sebagian diberi tipe pesan sah supaya parser masuk lebih dalam.
      if (len > 0 && nextFloat(rng) < 0.5) buf[0] = [1, 2, 10][Math.floor(nextFloat(rng) * 3)]!;
      return buf.buffer;
    };
    const randomText = () => {
      const pieces = [
        '{"t":"hello"',
        '"nick":',
        '"v":2',
        '"config":{',
        '"mode":"swing"',
        "}",
        ",",
        '"x',
      ];
      let s = "";
      const n = Math.floor(nextFloat(rng) * 12);
      for (let i = 0; i < n; i++) s += pieces[Math.floor(nextFloat(rng) * pieces.length)];
      return s;
    };
    for (let i = 0; i < 100_000; i++) {
      const buf = randomBytes();
      const input = decodeInput(buf);
      if (input) {
        const clean = sanitizeInput(input, 1000);
        expect(Number.isFinite(clean.x) && Number.isFinite(clean.power)).toBe(true);
      }
      decodeSnapshot(buf);
      decodePing(buf);
      const text = randomText();
      parseClientControl(text);
      parseQueueClient(text);
    }
  });
});

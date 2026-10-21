import { PROTOCOL_VERSION, QUEUE_TIMEOUT_MS, type QueueServer } from "@pinkponk/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_QUEUE, MatchmakerCore } from "./matchmaker-core";

let clock = 0;
let sent: Map<string, QueueServer[]>;
let closed: Set<string>;
let codeN = 0;

const make = () =>
  new MatchmakerCore({
    now: () => clock,
    newRoomCode: () => `ROOM${(codeN++).toString().padStart(2, "0")}`,
    send: (id, msg) => sent.set(id, [...(sent.get(id) ?? []), msg]),
    close: (id) => closed.add(id),
    remember: () => {},
  });

const req = (mode = "swing", gamble = false, v = PROTOCOL_VERSION) =>
  JSON.stringify({ t: "queue", v, mode, gamble });

describe("matchmaker", () => {
  beforeEach(() => {
    clock = 0;
    sent = new Map();
    closed = new Set();
    codeN = 0;
  });

  it("dua pemain dengan mode sama dipasangkan ke room yang sama", () => {
    const mm = make();
    mm.message("a", req());
    expect(sent.get("a")?.[0]).toEqual({ t: "queued", waiting: 1 });
    mm.message("b", req());
    expect(sent.get("a")?.at(-1)).toEqual({ t: "matched", code: "ROOM00" });
    expect(sent.get("b")?.at(-1)).toEqual({ t: "matched", code: "ROOM00" });
    expect(mm.size).toBe(0);
    expect(closed).toEqual(new Set(["a", "b"]));
  });

  it("mode berbeda tidak dipasangkan", () => {
    const mm = make();
    mm.message("a", req("swing", false));
    mm.message("b", req("swing", true));
    mm.message("c", req("timing", false));
    expect(mm.size).toBe(3);
  });

  it("pemain yang keluar dari antrean tidak dipasangkan", () => {
    const mm = make();
    mm.message("a", req());
    mm.leave("a");
    mm.message("b", req());
    expect(sent.get("b")?.at(-1)?.t).toBe("queued");
  });

  it("antrean kedaluwarsa setelah batas waktu", () => {
    const mm = make();
    mm.message("a", req());
    clock = QUEUE_TIMEOUT_MS / 2;
    mm.message("b", req("timing"));
    expect(mm.sweep()).toBe(QUEUE_TIMEOUT_MS);
    clock = QUEUE_TIMEOUT_MS + 1;
    mm.sweep();
    expect(sent.get("a")?.at(-1)).toEqual({ t: "timeout" });
    expect(mm.size).toBe(1);
  });

  it("menolak versi lama, pesan rusak, dan antrean penuh", () => {
    const mm = make();
    mm.message("old", req("swing", false, 1));
    expect(sent.get("old")?.at(-1)).toEqual({ t: "error", code: "outdated" });
    mm.message("bad", "{x");
    expect(sent.get("bad")?.at(-1)).toEqual({ t: "error", code: "bad-message" });
    // Mode berselang-seling agar tidak saling dipasangkan.
    for (let i = 0; i < MAX_QUEUE; i++) mm.message(`p${i}`, req("swing", false));
    expect(mm.size).toBeLessThanOrEqual(MAX_QUEUE);
  });

  it("pesan kedua dari koneksi yang sudah antre diabaikan", () => {
    const mm = make();
    mm.message("a", req());
    mm.message("a", req());
    expect(mm.size).toBe(1);
  });

  it("dipulihkan setelah hibernasi dengan urutan yang sama", () => {
    const mm = make();
    mm.restore([
      { id: "late", key: "swing:n", joinedAt: 5 },
      { id: "early", key: "swing:n", joinedAt: 1 },
    ]);
    expect(mm.size).toBe(2);
    mm.message("c", req());
    expect(sent.get("early")?.at(-1)?.t).toBe("matched");
    expect(sent.get("late")).toBeUndefined();
  });
});

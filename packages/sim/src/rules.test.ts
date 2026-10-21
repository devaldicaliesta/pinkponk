import { describe, expect, it } from "vitest";
import { onDead, onHit, onNetTouch, onTableBounce, startServe } from "./rules";

describe("aturan reli", () => {
  it("servis sah: pantul sisi server lalu sisi penerima", () => {
    const r = startServe(0);
    expect(onTableBounce(r, 0).kind).toBe("continue");
    expect(onTableBounce(r, 1).kind).toBe("continue");
    expect(r.phase).toBe("await-return");
    expect(r.expected).toBe(1);
  });

  it("servis langsung ke sisi lawan = servis gagal", () => {
    const r = startServe(0);
    expect(onTableBounce(r, 1)).toEqual({ kind: "point", winner: 1, reason: "serve-fault" });
  });

  it("servis menyentuh net lalu masuk = let", () => {
    const r = startServe(1);
    onTableBounce(r, 1);
    onNetTouch(r);
    expect(onTableBounce(r, 0).kind).toBe("let");
  });

  it("pantulan kedua di sisi penerima = poin untuk pemukul", () => {
    const r = startServe(0);
    onTableBounce(r, 0);
    onTableBounce(r, 1);
    expect(onTableBounce(r, 1)).toEqual({ kind: "point", winner: 0, reason: "double-bounce" });
  });

  it("memukul sebelum bola memantul di sisi sendiri (volley) = kehilangan poin", () => {
    const r = startServe(0);
    onTableBounce(r, 0);
    expect(onHit(r, 1)).toEqual({ kind: "point", winner: 0, reason: "miss" });
  });

  it("pukulan yang jatuh di sisi sendiri = kehilangan poin", () => {
    const r = startServe(0);
    onTableBounce(r, 0);
    onTableBounce(r, 1);
    expect(onHit(r, 1).kind).toBe("continue");
    expect(onTableBounce(r, 1)).toEqual({ kind: "point", winner: 0, reason: "own-side" });
  });

  it("pukulan keluar tanpa menyentuh meja = out", () => {
    const r = startServe(0);
    onTableBounce(r, 0);
    onTableBounce(r, 1);
    onHit(r, 1);
    expect(onDead(r)).toEqual({ kind: "point", winner: 0, reason: "out" });
  });

  it("gagal mengembalikan bola = poin untuk lawan", () => {
    const r = startServe(0);
    onTableBounce(r, 0);
    onTableBounce(r, 1);
    expect(onDead(r)).toEqual({ kind: "point", winner: 0, reason: "miss" });
  });
});

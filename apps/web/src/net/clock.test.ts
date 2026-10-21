import { describe, expect, it } from "vitest";
import { ClockSync } from "./clock";

describe("ClockSync", () => {
  it("memakai sampel dengan RTT terkecil", () => {
    const c = new ClockSync();
    // Jam server 1000 ms di depan jam lokal.
    c.add(0, 1050, 100); // rtt 100, simetris → offset 1000
    c.add(200, 1260, 300); // rtt 100, asimetris → offset 1010
    c.add(400, 1410, 420); // rtt 20 → offset 1000
    expect(c.offset).toBe(1000);
    expect(c.serverNow(500)).toBe(1500);
  });

  it("RTT median", () => {
    const c = new ClockSync();
    c.add(0, 0, 10);
    c.add(0, 0, 50);
    c.add(0, 0, 30);
    expect(c.rtt).toBe(30);
  });

  it("mengabaikan sampel rusak", () => {
    const c = new ClockSync();
    c.add(100, 0, 50);
    expect(c.ready).toBe(false);
  });
});

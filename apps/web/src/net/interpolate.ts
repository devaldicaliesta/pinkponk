import type { Snapshot } from "@pinkponk/protocol";
import { MS_PER_TICK, type Vec3 } from "@pinkponk/sim";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
});

export interface Interpolated {
  snapshot: Snapshot;
  ballPos: Vec3;
  bats: [number, number];
}

/** Buffer snapshot server; ambil keadaan pada waktu tampilan dengan interpolasi linier. */
export class SnapshotBuffer {
  private buf: Snapshot[] = [];

  push(s: Snapshot): void {
    const last = this.buf[this.buf.length - 1];
    if (last && s.tick <= last.tick) return;
    this.buf.push(s);
    if (this.buf.length > 64) this.buf.shift();
  }

  get latest(): Snapshot | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  clear(): void {
    this.buf = [];
  }

  /** Snapshot yang tick-nya sudah terlewati oleh waktu tampilan (untuk memutar event). */
  takeUntil(renderMs: number, consumed: number): Snapshot[] {
    return this.buf.filter((s) => s.tick > consumed && s.tick * MS_PER_TICK <= renderMs);
  }

  sample(renderMs: number): Interpolated | null {
    const tick = renderMs / MS_PER_TICK;
    let a: Snapshot | null = null;
    let b: Snapshot | null = null;
    for (const s of this.buf) {
      if (s.tick <= tick) a = s;
      else {
        b = s;
        break;
      }
    }
    const base = a ?? b;
    if (!base) return null;
    if (!a || !b) return { snapshot: base, ballPos: base.ball.pos, bats: base.bats };
    const t = (tick - a.tick) / (b.tick - a.tick);
    // Lompatan besar (pukulan dengan kompensasi lag, bola diletakkan ulang) tidak diinterpolasi.
    const jump = Math.hypot(b.ball.pos.x - a.ball.pos.x, b.ball.pos.z - a.ball.pos.z) > 1.2;
    return {
      snapshot: a,
      ballPos: jump ? (t < 0.5 ? a.ball.pos : b.ball.pos) : lerpVec(a.ball.pos, b.ball.pos, t),
      bats: [lerp(a.bats[0], b.bats[0], t), lerp(a.bats[1], b.bats[1], t)],
    };
  }
}

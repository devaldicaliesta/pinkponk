import {
  type MatchEvent,
  other,
  type ShotKind,
  type Side,
  TABLE_HALF_L,
  TABLE_HALF_W,
} from "@pinkponk/sim";

/** Momen "nyaris" dan drama yang pantas dirayakan di layar. */
export type MomentKind = "edge" | "netIn" | "save" | "comeback" | "rally";

export interface Moment {
  kind: MomentKind;
  /** Pemain yang membuat momen itu. */
  player: Side;
  /** Panjang reli untuk momen "rally". */
  n: number;
}

// Pantulan sejauh ini dari tepi meja terasa seperti "kena ujung".
const EDGE_X = TABLE_HALF_W - 0.035;
const EDGE_Z = TABLE_HALF_L - 0.05;
const COMEBACK_DEFICIT = 4;
const RALLY_STEP = 10;

/**
 * Membaca urutan event dan mengenali momen dramatis. Murni sisi tampilan: tidak memengaruhi
 * simulasi, jadi sama untuk Vs AI maupun online.
 */
export class MomentTracker {
  private lastHitter: Side | null = null;
  private lastShot: ShotKind | null = null;
  private netTouched = false;
  private hits = 0;
  private deficit: [number, number] = [0, 0];

  feed(e: MatchEvent, points: readonly [number, number]): Moment | null {
    switch (e.type) {
      case "hit":
        return this.onHit(e.player, e.shot);
      case "net":
        // Servis yang menyentuh net adalah let, bukan momen.
        if (this.lastShot !== null && this.lastShot !== "serve") this.netTouched = true;
        return null;
      case "bounce":
        return this.onBounce(e.side, e.x, e.z);
      case "point":
        this.resetRally();
        for (const p of [0, 1] as const) {
          this.deficit[p] = Math.max(this.deficit[p], points[other(p)] - points[p]);
        }
        return null;
      case "game": {
        const behind = this.deficit[e.winner];
        this.deficit = [0, 0];
        return behind >= COMEBACK_DEFICIT
          ? { kind: "comeback", player: e.winner, n: behind }
          : null;
      }
      default:
        return null;
    }
  }

  private onHit(player: Side, shot: ShotKind): Moment | null {
    const saved =
      this.lastShot === "smash" && this.lastHitter !== null && this.lastHitter !== player;
    this.lastHitter = player;
    this.lastShot = shot;
    this.netTouched = false;
    this.hits += 1;
    if (saved) return { kind: "save", player, n: this.hits };
    if (this.hits % RALLY_STEP === 0) return { kind: "rally", player, n: this.hits };
    return null;
  }

  private onBounce(side: Side, x: number, z: number): Moment | null {
    const hitter = this.lastHitter;
    if (hitter === null || this.lastShot === "serve" || side === hitter) {
      this.netTouched = false;
      return null;
    }
    if (this.netTouched) {
      this.netTouched = false;
      return { kind: "netIn", player: hitter, n: this.hits };
    }
    if (Math.abs(x) >= EDGE_X || Math.abs(z) >= EDGE_Z) {
      return { kind: "edge", player: hitter, n: this.hits };
    }
    return null;
  }

  private resetRally(): void {
    this.lastHitter = null;
    this.lastShot = null;
    this.netTouched = false;
    this.hits = 0;
  }
}

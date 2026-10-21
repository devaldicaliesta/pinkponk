import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import {
  BAT_CANVAS,
  BAT_GRIP,
  batArmPose,
  batTilt,
  CANVAS_H,
  CANVAS_W,
  drawArmSegment,
  drawBatHand,
  FOREARM_W,
  type Look,
  type Pose,
  SEGMENT_CANVAS,
  SEGMENT_LEN,
  UPPER_ARM_W,
  type View,
} from "./character";

export type Swing = "forehand" | "backhand" | "smash";

interface Spring {
  x: number;
  v: number;
}

// Kekakuan dan redaman pegas: tangan sedikit melewati target lalu kembali, seperti ayunan
// sungguhan, tanpa bergetar lama.
const HAND_K = 320;
const HAND_ZETA = 0.72;
const SWING_K = 150;
const SWING_ZETA = 0.42;
// Dorongan sudut awal (rad/s) saat memukul; tanda menentukan arah sapuan bat.
const SWING_KICK: Record<Swing, number> = { forehand: -9, backhand: 9, smash: 15 };
const MAX_DT = 0.05;

const stepSpring = (s: Spring, target: number, k: number, zeta: number, dt: number) => {
  const c = 2 * Math.sqrt(k) * zeta;
  s.v += (k * (target - s.x) - c * s.v) * dt;
  s.x += s.v * dt;
};

const makeTexture = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (ctx) draw(ctx);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
};

/**
 * Lengan pemegang bat yang digerakkan per frame di atas sprite badan. Sprite badan hanya
 * berganti per pose; tanpa ini bat melompat dari posisi ke posisi dan terasa kaku.
 */
export class BatArm {
  private readonly hand = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } };
  private readonly swing: Spring = { x: 0, v: 0 };
  private readonly upper: Mesh;
  private readonly fore: Mesh;
  private readonly bat: Mesh;
  private readonly materials: MeshBasicMaterial[] = [];
  private readonly textures: CanvasTexture[] = [];
  private lastNow = 0;
  /** Skala px kanvas karakter → meter, sama dengan sprite badan. */
  private readonly px: number;
  /** Dari depan sprite dicerminkan, jadi sumbu x lokal dibalik. */
  private readonly sgn: number;

  constructor(parent: Mesh, look: Look, view: View, spriteW: number) {
    this.px = spriteW / CANVAS_W;
    this.sgn = view === "back" ? 1 : -1;
    this.upper = this.part(SEGMENT_CANVAS, (ctx) => drawArmSegment(ctx, UPPER_ARM_W, look), 0);
    this.fore = this.part(SEGMENT_CANVAS, (ctx) => drawArmSegment(ctx, FOREARM_W, look), 0);
    // Titik tumpu bat di genggaman agar rotasi memutar bat di sekitar tangan.
    this.bat = this.part(
      BAT_CANVAS,
      (ctx) => drawBatHand(ctx, look, view),
      (BAT_CANVAS.h / 2 - BAT_GRIP.y) * this.px,
    );
    this.upper.position.z = 0.003;
    this.fore.position.z = 0.004;
    this.bat.position.z = 0.005;
    parent.add(this.upper, this.fore, this.bat);
    const start = batArmPose("idle").hand;
    this.hand.x.x = start.x;
    this.hand.y.x = start.y;
  }

  private part(
    size: Readonly<{ w: number; h: number }>,
    draw: (ctx: CanvasRenderingContext2D) => void,
    offsetY: number,
  ): Mesh {
    const tex = makeTexture(size.w, size.h, draw);
    const mat = new MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4 });
    const geo = new PlaneGeometry(size.w * this.px, size.h * this.px);
    geo.translate(0, offsetY, 0);
    this.textures.push(tex);
    this.materials.push(mat);
    return new Mesh(geo, mat);
  }

  /** Bat raksasa / mengecil dari kemampuan Gamble. */
  setBatScale(s: number): void {
    this.bat.scale.setScalar(s);
  }

  kick(swing: Swing, calm: boolean): void {
    if (!calm) this.swing.v += SWING_KICK[swing];
  }

  /** Posisi x tangan saat ini relatif terhadap tengah sprite (m), untuk menaruh sprite di bat. */
  handOffset(): number {
    return this.sgn * (this.hand.x.x - CANVAS_W / 2) * this.px;
  }

  update(pose: Pose, now: number, calm: boolean): void {
    const dt = Math.min(MAX_DT, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    const { shoulder, hand } = batArmPose(pose);
    // Goyangan kecil saat menunggu agar robot tidak terlihat beku.
    const resting = pose === "idle" || pose === "ready";
    const tx = hand.x + (resting && !calm ? Math.sin(now / 380) * 2.5 : 0);
    const ty = hand.y + (resting && !calm ? Math.cos(now / 460) * 3.5 : 0);
    if (calm || dt === 0) {
      this.hand.x = { x: tx, v: 0 };
      this.hand.y = { x: ty, v: 0 };
      this.swing.x = 0;
      this.swing.v = 0;
    } else {
      stepSpring(this.hand.x, tx, HAND_K, HAND_ZETA, dt);
      stepSpring(this.hand.y, ty, HAND_K, HAND_ZETA, dt);
      stepSpring(this.swing, 0, SWING_K, SWING_ZETA, dt);
    }
    this.place(shoulder, { x: this.hand.x.x, y: this.hand.y.x });
  }

  private local(p: { x: number; y: number }): [number, number] {
    return [this.sgn * (p.x - CANVAS_W / 2) * this.px, (CANVAS_H - p.y) * this.px];
  }

  private place(shoulder: { x: number; y: number }, hand: { x: number; y: number }): void {
    const [sx, sy] = this.local(shoulder);
    const [hx, hy] = this.local(hand);
    const dx = hx - sx;
    const dy = hy - sy;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const at = (t: number) => [sx + dx * t, sy + dy * t] as const;
    // Proporsi sama dengan lengan bebas yang digambar di sprite badan (0–0.34 dan 0.44–0.84).
    const segment = (m: Mesh, t0: number, t1: number) => {
      const [x0, y0] = at(t0);
      const [x1, y1] = at(t1);
      m.position.x = (x0 + x1) / 2;
      m.position.y = (y0 + y1) / 2;
      m.rotation.z = angle;
      m.scale.x = Math.max(0.2, ((t1 - t0) * len) / (SEGMENT_LEN * this.px));
    };
    segment(this.upper, 0, 0.34);
    segment(this.fore, 0.44, 0.84);
    this.bat.position.x = hx;
    this.bat.position.y = hy;
    // Kemiringan bat di kanvas (searah jarum jam, y ke bawah) menjadi rotasi lokal berlawanan.
    const tilt = batTilt(hand.x) + this.swing.x;
    this.bat.rotation.z = -this.sgn * tilt;
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const m of this.materials) m.dispose();
    for (const m of [this.upper, this.fore, this.bat]) m.geometry.dispose();
  }
}

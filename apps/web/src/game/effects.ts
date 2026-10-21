import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Scene,
  Sprite,
  SpriteMaterial,
} from "three";

const FLASH_MS = 260;
const RIPPLE_MS = 340;

const flashTexture = (): CanvasTexture => {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
};

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Efek sesaat yang membuat pukulan dan pantulan terasa bertenaga: kilatan dan riak meja. */
export class Effects {
  private readonly tex = flashTexture();
  private readonly flashMat = new SpriteMaterial({
    map: this.tex,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  private readonly flash = new Sprite(this.flashMat);
  private readonly rippleMat = new MeshBasicMaterial({
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
  });
  private readonly ripple = new Mesh(new RingGeometry(0.75, 1, 32), this.rippleMat);
  private flashAt = Number.NEGATIVE_INFINITY;
  private flashSize = 0.4;
  private rippleAt = Number.NEGATIVE_INFINITY;

  constructor(scene: Scene) {
    this.flash.visible = false;
    this.flash.renderOrder = 5;
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.visible = false;
    scene.add(this.flash, this.ripple);
  }

  hit(x: number, y: number, z: number, strong: boolean, color: string, now: number): void {
    this.flash.position.set(x, y, z);
    this.flashMat.color.set(color);
    this.flashSize = strong ? 0.7 : 0.38;
    this.flashAt = now;
  }

  bounce(x: number, z: number, color: string, now: number): void {
    // Sedikit di atas permukaan meja agar tidak berkedip bertumpuk dengan meja.
    this.ripple.position.set(x, 0.004, z);
    this.rippleMat.color.set(color);
    this.rippleAt = now;
  }

  update(now: number): void {
    const f = (now - this.flashAt) / FLASH_MS;
    this.flash.visible = f >= 0 && f < 1;
    if (this.flash.visible) {
      this.flash.scale.setScalar(this.flashSize * (0.4 + 0.6 * easeOut(f)));
      this.flashMat.opacity = 1 - f;
    }
    const r = (now - this.rippleAt) / RIPPLE_MS;
    this.ripple.visible = r >= 0 && r < 1;
    if (this.ripple.visible) {
      this.ripple.scale.setScalar(0.03 + 0.15 * easeOut(r));
      this.rippleMat.opacity = 0.85 * (1 - r);
    }
  }

  dispose(): void {
    this.tex.dispose();
    this.flashMat.dispose();
    this.rippleMat.dispose();
    this.ripple.geometry.dispose();
  }
}

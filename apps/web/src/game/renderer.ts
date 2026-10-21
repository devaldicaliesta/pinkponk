import { FLOOR_Y, HIT_PLANE_Z, isOverTable, type MatchEvent, type Side } from "@pinkponk/sim";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  type Color,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Pov } from "../state/settings";
import { CANVAS_H, CANVAS_W, drawCharacter, type Look, type Pose, type View } from "./character";
import { buildScene, type SceneParts, type ThemeColors } from "./scene";
import type { MatchView } from "./session";

export interface RingInfo {
  x: number;
  y: number;
  z: number;
  /** 1 = jauh dari waktu ideal, 0 = tepat. */
  progress: number;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  colors: ThemeColors;
  looks: [Look, Look];
  /** Sisi yang dilihat dari belakang (pemain di perangkat ini). */
  viewer: Side;
  pov: Pov;
  lowQuality: boolean;
  reducedMotion: boolean;
}

const TRAIL_LEN = 14;
const SPRITE_W = 1.2;
const SPRITE_H = 1.8;
const POSE_MS: Partial<Record<Pose, number>> = {
  forehand: 320,
  backhand: 320,
  smash: 420,
  serve: 600,
};

interface Avatar {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  pose: Pose;
  poseUntil: number;
  textures: Map<string, CanvasTexture>;
  look: Look;
  view: View;
}

export class GameRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(50, 1, 0.05, 60);
  private readonly parts: SceneParts;
  private readonly avatars: [Avatar, Avatar];
  private readonly trail: Line;
  private readonly trailPositions = new Float32Array(TRAIL_LEN * 3);
  private trailCount = 0;
  private trailUntil = 0;
  private shakeUntil = 0;
  private camPos = new Vector3(0, 1.5, 3);
  private camLook = new Vector3(0, 0, -0.4);
  private aspect = 1;
  private pov: Pov;
  private readonly flip: number;
  private batY: [number, number] = [0.15, 0.15];

  constructor(private readonly opts: RendererOptions) {
    this.renderer = new WebGLRenderer({
      canvas: opts.canvas,
      antialias: !opts.lowQuality,
      alpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.setQuality(opts.lowQuality);
    this.parts = buildScene(opts.colors);
    this.pov = opts.pov;
    // Pemain di sisi 1 (online) melihat meja dari arah sebaliknya: dunia diputar 180°.
    this.flip = opts.viewer === 1 ? -1 : 1;
    this.avatars = [this.makeAvatar(0), this.makeAvatar(1)];
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(this.trailPositions, 3));
    this.trail = new Line(
      geo,
      new LineBasicMaterial({ color: opts.colors.lime, transparent: true, opacity: 0.9 }),
    );
    this.trail.frustumCulled = false;
    this.parts.scene.add(this.trail);
    this.applyTheme(opts.colors);
  }

  private makeAvatar(side: Side): Avatar {
    const mat = new MeshBasicMaterial({ transparent: true, alphaTest: 0.4 });
    const mesh = new Mesh(new PlaneGeometry(SPRITE_W, SPRITE_H), mat);
    this.parts.scene.add(mesh);
    const view: View = side === this.opts.viewer ? "back" : "front";
    const a: Avatar = {
      mesh,
      mat,
      pose: "idle",
      poseUntil: 0,
      textures: new Map(),
      look: this.opts.looks[side],
      view,
    };
    this.setPose(a, "idle");
    return a;
  }

  private texture(a: Avatar, pose: Pose): CanvasTexture {
    const key = `${pose}|${a.view}`;
    let tex = a.textures.get(key);
    if (!tex) {
      const c = document.createElement("canvas");
      c.width = CANVAS_W;
      c.height = CANVAS_H;
      const ctx = c.getContext("2d");
      if (ctx) drawCharacter(ctx, a.look, pose, a.view);
      tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      a.textures.set(key, tex);
    }
    return tex;
  }

  private setPose(a: Avatar, pose: Pose, now = 0): void {
    a.pose = pose;
    a.poseUntil = now + (POSE_MS[pose] ?? 0);
    a.mat.map = this.texture(a, pose);
    a.mat.needsUpdate = true;
  }

  setPov(pov: Pov): void {
    this.pov = pov;
  }

  setQuality(low: boolean): void {
    this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  }

  applyTheme(c: ThemeColors): void {
    const p = this.parts;
    (p.scene.background as Color).set(c.bg);
    p.tableTop.color.set(c.table);
    p.lines.color.set(c.tableLine);
    p.floor.color.set(c.floor);
    p.ballMat.color.set(c.ball);
    p.ringMat.color.set(c.dark ? c.lime : c.pink);
    p.floorGlow.visible = c.dark && !this.opts.lowQuality;
    p.ballGlow.visible = c.dark && !this.opts.lowQuality;
    const trailMat = this.trail.material as LineBasicMaterial;
    trailMat.blending = c.dark ? AdditiveBlending : NormalBlending;
    trailMat.color.set(c.dark ? c.lime : c.pink);
    this.opts.colors = c;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.aspect = width / Math.max(1, height);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Reaksi visual atas kejadian pertandingan (pose karakter, jejak, getar layar). */
  onEvent(e: MatchEvent, now: number, view: MatchView): void {
    if (e.type === "hit") {
      const a = this.avatars[e.player];
      if (e.shot === "smash") {
        this.setPose(a, "smash", now);
        this.trailUntil = now + 900;
        if (!this.opts.reducedMotion) this.shakeUntil = now + 150;
      } else if (e.shot !== "serve") {
        const batX = view.bats[e.player];
        const forehand = (view.ball.pos.x - batX) * (e.player === 0 ? 1 : -1) >= 0;
        this.setPose(a, forehand ? "forehand" : "backhand", now);
      }
    } else if (e.type === "toss") {
      this.setPose(this.avatars[e.player], "serve", now);
    } else if (e.type === "point") {
      if (e.reason === "let") return;
      this.setPose(this.avatars[e.winner], "win", now);
      this.avatars[e.winner].poseUntil = now + 1000;
      const loser = this.avatars[e.winner === 0 ? 1 : 0];
      this.setPose(loser, "lose", now);
      loser.poseUntil = now + 1000;
      this.trailCount = 0;
    } else if (e.type === "match") {
      this.setPose(this.avatars[e.winner], "win", now);
      this.avatars[e.winner].poseUntil = Number.POSITIVE_INFINITY;
      const loser = this.avatars[e.winner === 0 ? 1 : 0];
      this.setPose(loser, "lose", now);
      loser.poseUntil = Number.POSITIVE_INFINITY;
    }
  }

  render(v: MatchView, now: number, ring: RingInfo | null, fever: boolean): void {
    const p = this.parts;
    const f = this.flip;
    const b = v.ball.pos;
    p.ball.position.set(b.x * f, b.y, b.z * f);
    p.ballGlow.position.copy(p.ball.position);
    const overTable = isOverTable(b.x, b.z) && b.y >= 0;
    p.shadow.position.set(b.x * f, overTable ? 0.002 : FLOOR_Y + 0.003, b.z * f);
    (p.shadow.material as MeshBasicMaterial).opacity = overTable ? Math.max(0.1, 0.4 - b.y) : 0.25;

    this.updateBats(v);
    this.updateAvatars(v, now);
    this.updateTrail(v, now, fever);
    this.updateRing(ring);
    this.updateCamera(v, now);
    this.renderer.render(p.scene, this.camera);
  }

  private updateBats(v: MatchView): void {
    for (const side of [0, 1] as const) {
      const bat = this.parts.bats[side];
      const z = (side === 0 ? HIT_PLANE_Z : -HIT_PLANE_Z) * this.flip;
      // Tinggi bat mengikuti bola saat mendekat (bantuan otomatis), selain itu posisi siap.
      const ball = v.ball.pos;
      const near = Math.abs(ball.z - (side === 0 ? HIT_PLANE_Z : -HIT_PLANE_Z)) < 1.2;
      const targetY = near ? Math.min(0.55, Math.max(0.04, ball.y)) : 0.18;
      this.batY[side] += (targetY - this.batY[side]) * 0.25;
      bat.position.set(v.bats[side] * this.flip, this.batY[side] + 0.06, z);
      bat.rotation.y = side === this.opts.viewer ? 0 : Math.PI;
      bat.visible = this.pov === "first" && side === this.opts.viewer;
    }
  }

  private updateAvatars(v: MatchView, now: number): void {
    for (const side of [0, 1] as const) {
      const a = this.avatars[side];
      if (now > a.poseUntil) {
        const next: Pose = v.phase === "rally" ? "ready" : "idle";
        if (a.pose !== next) this.setPose(a, next, now);
      }
      // Tangan pemegang bat ada di kanan karakter: dari belakang tampak di kanan layar,
      // dari depan di kiri layar. Badan digeser agar tangan sejajar bat.
      const bodyOffset = side === this.opts.viewer ? -0.3 : 0.21;
      const z = (side === 0 ? HIT_PLANE_Z + 0.32 : -HIT_PLANE_Z - 0.32) * this.flip;
      const x = v.bats[side] * this.flip + bodyOffset;
      a.mesh.position.set(x, FLOOR_Y + SPRITE_H / 2 - 0.02, z);
      a.mesh.rotation.y = Math.atan2(this.camPos.x - x, this.camPos.z - z);
      a.mesh.visible = !(this.pov === "first" && side === this.opts.viewer);
    }
  }

  private updateTrail(v: MatchView, now: number, fever: boolean): void {
    const show = now < this.trailUntil || fever;
    this.trail.visible = show && v.phase === "rally";
    if (!this.trail.visible) {
      this.trailCount = 0;
      return;
    }
    const pos = this.trailPositions;
    pos.copyWithin(3, 0, (TRAIL_LEN - 1) * 3);
    pos[0] = v.ball.pos.x * this.flip;
    pos[1] = v.ball.pos.y;
    pos[2] = v.ball.pos.z * this.flip;
    this.trailCount = Math.min(TRAIL_LEN, this.trailCount + 1);
    const geo = this.trail.geometry;
    geo.setDrawRange(0, this.trailCount);
    (geo.getAttribute("position") as BufferAttribute).needsUpdate = true;
  }

  private updateRing(ring: RingInfo | null): void {
    const { ring: r, ringTarget: t } = this.parts;
    r.visible = ring !== null;
    t.visible = ring !== null;
    if (!ring) return;
    const pos = new Vector3(ring.x * this.flip, ring.y, ring.z * this.flip);
    const base = 0.07;
    r.position.copy(pos);
    t.position.copy(pos);
    r.scale.setScalar(base * (1 + ring.progress * 3));
    t.scale.setScalar(base);
    r.lookAt(this.camera.position);
    t.lookAt(this.camera.position);
  }

  private updateCamera(v: MatchView, now: number): void {
    const portrait = this.aspect < 0.85;
    const f = this.flip;
    const viewerBat = v.bats[this.opts.viewer] * f;
    let pos: Vector3;
    let look: Vector3;
    let fov: number;
    switch (this.pov) {
      case "first":
        // Cukup jauh di belakang bat agar bat tidak menutupi lawan.
        pos = new Vector3(viewerBat * 0.7, 0.55, HIT_PLANE_Z + (portrait ? 1.35 : 1.05));
        look = new Vector3(viewerBat * 0.3, 0, -1.1);
        fov = portrait ? 75 : 62;
        break;
      case "tv": {
        const follow = this.opts.reducedMotion ? 0 : v.ball.pos.z * f * 0.25;
        pos = portrait ? new Vector3(2.4, 2.6, 3.4) : new Vector3(2.6, 1.7, 2.6);
        pos.z += follow;
        look = new Vector3(0, -0.1, -0.2 + follow);
        fov = portrait ? 62 : 48;
        break;
      }
      default:
        // Potret: kamera lebih tinggi agar karakter dekat tidak menutupi meja.
        pos = portrait ? new Vector3(0, 3.5, 3.5) : new Vector3(0, 1.75, 3.2);
        look = portrait ? new Vector3(0, -0.25, -0.3) : new Vector3(0, -0.2, -0.45);
        fov = portrait ? 58 : 50;
    }
    const k = this.opts.reducedMotion ? 1 : 0.12;
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (now < this.shakeUntil) {
      this.camera.position.x += (Math.random() - 0.5) * 0.02;
      this.camera.position.y += (Math.random() - 0.5) * 0.02;
    }
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.camLook);
  }

  dispose(): void {
    this.parts.dispose();
    for (const a of this.avatars) {
      for (const t of a.textures.values()) t.dispose();
      a.mat.dispose();
      a.mesh.geometry.dispose();
    }
    this.trail.geometry.dispose();
    (this.trail.material as LineBasicMaterial).dispose();
    this.renderer.dispose();
  }
}

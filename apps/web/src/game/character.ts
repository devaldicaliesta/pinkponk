// Karakter robot digambar prosedural dengan Canvas 2D: tidak ada file sprite yang
// diunduh, dan warna kustom cukup menggambar ulang. Gaya: garis hitam tebal, sendi
// bulat, lengan/kaki lentur, visor dan antena menyala neon.

export const FRAMES = ["#c9ccd6", "#f4f1f7", "#4a4a58", "#e8c26b", "#9fe3d0", "#b9a6ff"];
export const ARMORS = ["#ff2e9a", "#3de8ff", "#c6ff3d", "#ff8a00", "#8b5cf6", "#f7f0fa"];
export const VISORS = ["#c6ff3d", "#3de8ff", "#ff2e9a", "#ffd23d", "#ffffff", "#ff5a5a"];
export const BATS = ["#e5174f", "#111111", "#2747c9", "#c6ff3d"];

export interface Look {
  frame: string;
  armor: string;
  visor: string;
  bat: string;
}

export type Pose = "idle" | "ready" | "forehand" | "backhand" | "smash" | "serve" | "win" | "lose";
export type View = "front" | "back";

export const CANVAS_W = 256;
export const CANVAS_H = 384;

const INK = "#111111";
const PANEL = "#1a1426";

interface Point {
  x: number;
  y: number;
}

interface PoseShape {
  batHand: Point;
  freeHand: Point;
  feet: [Point, Point];
  bob: number;
}

const POSES: Record<Pose, PoseShape> = {
  idle: {
    batHand: { x: 152, y: 196 },
    freeHand: { x: 106, y: 198 },
    feet: [
      { x: 76, y: 356 },
      { x: 180, y: 356 },
    ],
    bob: 4,
  },
  ready: {
    batHand: { x: 170, y: 168 },
    freeHand: { x: 94, y: 176 },
    feet: [
      { x: 62, y: 356 },
      { x: 194, y: 356 },
    ],
    bob: 10,
  },
  forehand: {
    batHand: { x: 224, y: 140 },
    freeHand: { x: 84, y: 170 },
    feet: [
      { x: 60, y: 356 },
      { x: 198, y: 356 },
    ],
    bob: 8,
  },
  backhand: {
    batHand: { x: 50, y: 150 },
    freeHand: { x: 104, y: 196 },
    feet: [
      { x: 60, y: 356 },
      { x: 198, y: 356 },
    ],
    bob: 8,
  },
  smash: {
    batHand: { x: 198, y: 30 },
    freeHand: { x: 82, y: 122 },
    feet: [
      { x: 68, y: 356 },
      { x: 188, y: 356 },
    ],
    bob: 0,
  },
  serve: {
    batHand: { x: 198, y: 190 },
    freeHand: { x: 100, y: 40 },
    feet: [
      { x: 78, y: 356 },
      { x: 178, y: 356 },
    ],
    bob: 2,
  },
  win: {
    batHand: { x: 198, y: 24 },
    freeHand: { x: 58, y: 24 },
    feet: [
      { x: 86, y: 356 },
      { x: 170, y: 356 },
    ],
    bob: -6,
  },
  lose: {
    batHand: { x: 160, y: 238 },
    freeHand: { x: 98, y: 238 },
    feet: [
      { x: 98, y: 356 },
      { x: 158, y: 356 },
    ],
    bob: 12,
  },
};

const outline = (ctx: CanvasRenderingContext2D, fill: string, width = 5) => {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.stroke();
};

const circle = (ctx: CanvasRenderingContext2D, p: Point, r: number, fill: string) => {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  outline(ctx, fill);
};

const box = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  outline(ctx, fill);
};

// Siku/lutut ditekuk keluar dari garis lurus agar terlihat lentur.
const bend = (a: Point, b: Point, amount: number): Point => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mx - (dy / len) * amount, y: my + (dx / len) * amount };
};

/** Lengan/kaki: tabung lentur dengan sendi bulat di tengah lengkungan. */
const limb = (
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  curve: number,
  color: string,
  w: number,
) => {
  const ctrl = bend(from, to, curve);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 8;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
  const joint = {
    x: 0.25 * from.x + 0.5 * ctrl.x + 0.25 * to.x,
    y: 0.25 * from.y + 0.5 * ctrl.y + 0.25 * to.y,
  };
  circle(ctx, joint, w * 0.55, color);
};

const drawBat = (ctx: CanvasRenderingContext2D, hand: Point, color: string) => {
  const head = { x: hand.x + (hand.x > 128 ? 10 : -10), y: hand.y - 22 };
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hand.x, hand.y);
  ctx.lineTo(head.x, head.y);
  ctx.stroke();
  circle(ctx, head, 22, color);
};

const drawFoot = (ctx: CanvasRenderingContext2D, p: Point, toRight: boolean, look: Look) => {
  box(ctx, toRight ? p.x - 14 : p.x - 30, p.y - 10, 44, 22, 8, look.frame);
  ctx.fillStyle = look.armor;
  ctx.fillRect(toRight ? p.x - 10 : p.x - 26, p.y + 5, 36, 4);
};

const drawTorso = (ctx: CanvasRenderingContext2D, look: Look, view: View) => {
  box(ctx, 98, 196, 60, 40, 12, look.frame);
  box(ctx, 82, 100, 92, 104, 22, look.armor);
  if (view === "front") {
    // Panel dada dengan inti yang menyala (emblem PinkPonk: bola di tengah).
    box(ctx, 106, 122, 44, 40, 12, PANEL);
    ctx.beginPath();
    ctx.arc(128, 142, 9, 0, Math.PI * 2);
    ctx.fillStyle = look.visor;
    ctx.fill();
    return;
  }
  // Punggung: kisi ventilasi.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (const y of [128, 142, 156]) {
    ctx.beginPath();
    ctx.moveTo(110, y);
    ctx.lineTo(146, y);
    ctx.stroke();
  }
};

const drawEyes = (ctx: CanvasRenderingContext2D, color: string, pose: Pose) => {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  if (pose === "win" || pose === "lose") {
    // Menang: mata ^ ^. Kalah: mata datar.
    for (const x of [116, 140]) {
      ctx.beginPath();
      ctx.moveTo(x - 7, pose === "win" ? 64 : 62);
      if (pose === "win") ctx.lineTo(x, 56);
      ctx.lineTo(x + 7, pose === "win" ? 64 : 62);
      ctx.stroke();
    }
    return;
  }
  const h = pose === "smash" ? 14 : 10;
  for (const x of [112, 136]) {
    ctx.beginPath();
    ctx.roundRect(x, 60 - h / 2, 8, h, 3);
    ctx.fill();
  }
};

const drawHead = (ctx: CanvasRenderingContext2D, look: Look, view: View, pose: Pose) => {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(128, 30);
  ctx.lineTo(128, 12);
  ctx.stroke();
  circle(ctx, { x: 128, y: 10 }, 7, look.visor);
  box(ctx, 120, 88, 16, 16, 4, PANEL);
  circle(ctx, { x: 88, y: 62 }, 8, look.armor);
  circle(ctx, { x: 168, y: 62 }, 8, look.armor);
  box(ctx, 92, 28, 72, 66, 20, look.frame);
  if (view === "back") {
    ctx.fillStyle = PANEL;
    for (const x of [112, 125, 138]) ctx.fillRect(x, 50, 6, 22);
    return;
  }
  box(ctx, 100, 44, 56, 32, 12, PANEL);
  drawEyes(ctx, look.visor, pose);
};

export const drawCharacter = (
  ctx: CanvasRenderingContext2D,
  look: Look,
  pose: Pose,
  view: View,
): void => {
  const p = POSES[pose];
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.save();
  if (view === "front") {
    // Dilihat dari depan, tangan kanan robot tampak di kiri layar.
    ctx.translate(CANVAS_W, 0);
    ctx.scale(-1, 1);
  }
  ctx.translate(0, p.bob);
  limb(ctx, { x: 114, y: 232 }, p.feet[0], -24, look.frame, 18);
  limb(ctx, { x: 142, y: 232 }, p.feet[1], 24, look.frame, 18);
  drawFoot(ctx, p.feet[0], false, look);
  drawFoot(ctx, p.feet[1], true, look);
  drawTorso(ctx, look, view);
  limb(ctx, { x: 92, y: 116 }, p.freeHand, -28, look.frame, 16);
  limb(ctx, { x: 164, y: 116 }, p.batHand, 28, look.frame, 16);
  circle(ctx, { x: 90, y: 114 }, 13, look.armor);
  circle(ctx, { x: 166, y: 114 }, 13, look.armor);
  circle(ctx, p.freeHand, 12, look.frame);
  drawBat(ctx, p.batHand, look.bat);
  circle(ctx, p.batHand, 12, look.frame);
  ctx.restore();
  // Kepala simetris; digambar tanpa cermin agar mata tidak ikut terbalik.
  ctx.save();
  ctx.translate(0, p.bob);
  drawHead(ctx, look, view, pose);
  ctx.restore();
};

export const lookFromIndices = (i: {
  frame: number;
  armor: number;
  visor: number;
  bat: number;
}): Look => ({
  frame: FRAMES[i.frame] ?? FRAMES[0]!,
  armor: ARMORS[i.armor] ?? ARMORS[0]!,
  visor: VISORS[i.visor] ?? VISORS[0]!,
  bat: BATS[i.bat] ?? BATS[0]!,
});

/** Robot lawan dibuat kontras dengan robot pemain. */
export const opponentLook = (mine: Look): Look => ({
  frame: mine.frame === FRAMES[2] ? FRAMES[0]! : FRAMES[2]!,
  armor: mine.armor === ARMORS[1] ? ARMORS[3]! : ARMORS[1]!,
  visor: mine.visor === VISORS[2] ? VISORS[1]! : VISORS[2]!,
  bat: BATS[1]!,
});

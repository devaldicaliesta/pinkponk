// Karakter robot maskot digambar prosedural dengan Canvas 2D: tidak ada file sprite yang
// diunduh, dan warna kustom cukup menggambar ulang. Gaya: badan kapsul, helm dengan visor
// kaca, melayang di atas pendorong yang menyala, garis hitam tebal, bayangan flat.

export const FRAMES = ["#e9ebf2", "#c9ccd6", "#4a4a58", "#e8c26b", "#9fe3d0", "#b9a6ff"];
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

export const POSE_LIST = Object.freeze([
  "idle",
  "ready",
  "forehand",
  "backhand",
  "smash",
  "serve",
  "win",
  "lose",
] as const satisfies readonly Pose[]);

export const CANVAS_W = 256;
export const CANVAS_H = 384;

const INK = "#141018";
const GLASS = "#191424";
const SHADE = "rgba(20, 10, 30, 0.22)";
const SHINE = "rgba(255, 255, 255, 0.45)";

interface Point {
  x: number;
  y: number;
}

type Eyes = "normal" | "left" | "right" | "fierce" | "happy" | "sad" | "wink";

interface PoseShape {
  batHand: Point;
  freeHand: Point;
  /** Kemiringan badan (radian), positif = condong ke kanan layar. */
  lean: number;
  /** Naik-turun melayang (px). */
  bob: number;
  eyes: Eyes;
}

// biome-ignore format: satu baris per pose agar tabel mudah dibandingkan
const POSES: Record<Pose, PoseShape> = {
  idle: { batHand: { x: 198, y: 252 }, freeHand: { x: 58, y: 252 }, lean: 0, bob: 0, eyes: "normal" },
  ready: { batHand: { x: 208, y: 222 }, freeHand: { x: 50, y: 230 }, lean: 0, bob: 6, eyes: "normal" },
  forehand: { batHand: { x: 214, y: 192 }, freeHand: { x: 58, y: 236 }, lean: 0.08, bob: 4, eyes: "right" },
  backhand: { batHand: { x: 46, y: 204 }, freeHand: { x: 72, y: 256 }, lean: -0.08, bob: 4, eyes: "left" },
  smash: { batHand: { x: 214, y: 118 }, freeHand: { x: 46, y: 206 }, lean: -0.05, bob: -6, eyes: "fierce" },
  serve: { batHand: { x: 206, y: 250 }, freeHand: { x: 56, y: 150 }, lean: 0, bob: 0, eyes: "wink" },
  win: { batHand: { x: 220, y: 128 }, freeHand: { x: 36, y: 128 }, lean: 0, bob: -12, eyes: "happy" },
  lose: { batHand: { x: 182, y: 292 }, freeHand: { x: 74, y: 292 }, lean: 0, bob: 12, eyes: "sad" },
};

const SHOULDER_L: Point = { x: 86, y: 210 };
const SHOULDER_R: Point = { x: 170, y: 210 };
const PIVOT: Point = { x: 128, y: 340 };

const stroke = (ctx: CanvasRenderingContext2D, width = 5) => {
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.stroke();
};

const fillStroke = (ctx: CanvasRenderingContext2D, fill: string, width = 5) => {
  ctx.fillStyle = fill;
  ctx.fill();
  stroke(ctx, width);
};

const circle = (ctx: CanvasRenderingContext2D, p: Point, r: number, fill: string) => {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  fillStroke(ctx, fill);
};

const rounded = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/** Bayangan flat di sisi kanan-bawah bentuk pada path aktif. */
const shadeCurrentPath = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) => {
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = SHADE;
  ctx.fill();
  ctx.restore();
};

const drawHover = (ctx: CanvasRenderingContext2D, look: Look) => {
  const glow = ctx.createRadialGradient(128, 360, 4, 128, 360, 70);
  glow.addColorStop(0, `${look.visor}cc`);
  glow.addColorStop(1, `${look.visor}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(128, 360, 72, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  rounded(ctx, 104, 312, 48, 26, 10);
  fillStroke(ctx, look.frame);
  rounded(ctx, 112, 330, 32, 6, 3);
  ctx.fillStyle = look.visor;
  ctx.fill();
};

const drawBody = (ctx: CanvasRenderingContext2D, look: Look, view: View) => {
  rounded(ctx, 80, 172, 96, 150, 48);
  ctx.fillStyle = look.armor;
  ctx.fill();
  rounded(ctx, 80, 172, 96, 150, 48);
  shadeCurrentPath(ctx, 172, 318, 70, 70);
  rounded(ctx, 80, 172, 96, 150, 48);
  stroke(ctx);
  // Kilau di sisi kiri atas.
  ctx.beginPath();
  ctx.arc(128, 248, 36, Math.PI * 1.08, Math.PI * 1.42);
  ctx.strokeStyle = SHINE;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.stroke();
  if (view === "front") {
    // Panel dada dengan emblem PinkPonk (bola menyala).
    rounded(ctx, 104, 222, 48, 46, 16);
    fillStroke(ctx, GLASS, 4);
    ctx.beginPath();
    ctx.arc(128, 245, 10, 0, Math.PI * 2);
    ctx.fillStyle = look.visor;
    ctx.fill();
    return;
  }
  // Punggung: tutup baterai dan kisi ventilasi.
  rounded(ctx, 106, 214, 44, 60, 14);
  stroke(ctx, 4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (const y of [232, 244, 256]) {
    ctx.beginPath();
    ctx.moveTo(116, y);
    ctx.lineTo(140, y);
    ctx.stroke();
  }
};

const drawArm = (ctx: CanvasRenderingContext2D, from: Point, to: Point, look: Look) => {
  // Lengkung ke luar badan agar lengan terlihat lentur, bukan kaku.
  const out = to.x >= from.x ? 1 : -1;
  const ctrl = { x: (from.x + to.x) / 2 + out * 12, y: Math.max(from.y, to.y) + 10 };
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 24;
  ctx.stroke();
  ctx.strokeStyle = look.frame;
  ctx.lineWidth = 15;
  ctx.stroke();
  circle(ctx, from, 13, look.armor);
};

const drawBat = (ctx: CanvasRenderingContext2D, hand: Point, color: string) => {
  const side = hand.x >= 128 ? 1 : -1;
  const head = { x: hand.x + side * 12, y: hand.y - 24 };
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hand.x, hand.y);
  ctx.lineTo(head.x, head.y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.strokeStyle = "#d9a066";
  ctx.lineWidth = 6;
  ctx.stroke();
  circle(ctx, head, 23, color);
  ctx.beginPath();
  ctx.arc(head.x - 6, head.y - 6, 9, Math.PI * 1.1, Math.PI * 1.6);
  ctx.strokeStyle = SHINE;
  ctx.lineWidth = 4;
  ctx.stroke();
};

const capsule = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  rounded(ctx, x - w / 2, y - h / 2, w, h, w / 2);
  ctx.fill();
};

const drawEyes = (ctx: CanvasRenderingContext2D, color: string, eyes: Eyes) => {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  switch (eyes) {
    case "happy":
    case "sad":
      for (const x of [108, 148]) {
        ctx.beginPath();
        if (eyes === "happy") ctx.arc(x, 112, 10, Math.PI * 1.15, Math.PI * 1.85);
        else ctx.arc(x, 100, 10, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
      return;
    case "wink":
      capsule(ctx, 108, 106, 13, 22);
      ctx.beginPath();
      ctx.moveTo(140, 108);
      ctx.lineTo(156, 108);
      ctx.stroke();
      return;
    case "fierce":
      capsule(ctx, 108, 110, 13, 16);
      capsule(ctx, 148, 110, 13, 16);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(96, 92);
      ctx.lineTo(118, 99);
      ctx.moveTo(160, 92);
      ctx.lineTo(138, 99);
      ctx.stroke();
      return;
    default: {
      const shift = eyes === "left" ? -7 : eyes === "right" ? 7 : 0;
      capsule(ctx, 108 + shift, 106, 13, 22);
      capsule(ctx, 148 + shift, 106, 13, 22);
    }
  }
};

const drawHead = (ctx: CanvasRenderingContext2D, look: Look, view: View, eyes: Eyes) => {
  // Kerah leher menyambung helm ke badan.
  rounded(ctx, 106, 146, 44, 34, 12);
  fillStroke(ctx, look.frame);
  ctx.beginPath();
  ctx.moveTo(128, 56);
  ctx.quadraticCurveTo(130, 36, 142, 26);
  stroke(ctx, 5);
  circle(ctx, { x: 142, y: 24 }, 8, look.visor);
  circle(ctx, { x: 64, y: 108 }, 14, look.armor);
  circle(ctx, { x: 192, y: 108 }, 14, look.armor);
  rounded(ctx, 66, 52, 124, 108, 46);
  ctx.fillStyle = look.frame;
  ctx.fill();
  rounded(ctx, 66, 52, 124, 108, 46);
  shadeCurrentPath(ctx, 176, 162, 80, 50);
  rounded(ctx, 66, 52, 124, 108, 46);
  stroke(ctx);
  if (view === "back") {
    // Bagian belakang helm: panel ventilasi kecil.
    rounded(ctx, 104, 104, 48, 30, 12);
    fillStroke(ctx, GLASS, 4);
    ctx.strokeStyle = look.visor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const y of [114, 124]) {
      ctx.beginPath();
      ctx.moveTo(114, y);
      ctx.lineTo(142, y);
      ctx.stroke();
    }
    return;
  }
  // Visor kaca dengan pantulan diagonal.
  rounded(ctx, 82, 74, 92, 66, 30);
  fillStroke(ctx, GLASS, 4);
  ctx.save();
  rounded(ctx, 82, 74, 92, 66, 30);
  ctx.clip();
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.moveTo(150, 74);
  ctx.lineTo(174, 74);
  ctx.lineTo(132, 140);
  ctx.lineTo(108, 140);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  drawEyes(ctx, look.visor, eyes);
};

export const drawCharacter = (
  ctx: CanvasRenderingContext2D,
  look: Look,
  pose: Pose,
  view: View,
): void => {
  const p = POSES[pose];
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawHover(ctx, look);
  ctx.save();
  if (view === "front") {
    // Dilihat dari depan, tangan kanan robot tampak di kiri layar.
    ctx.translate(CANVAS_W, 0);
    ctx.scale(-1, 1);
  }
  ctx.translate(PIVOT.x, PIVOT.y + p.bob);
  ctx.rotate(p.lean);
  ctx.translate(-PIVOT.x, -PIVOT.y);
  // Dari belakang lengan tertutup badan; dari depan lengan di depan badan.
  const behind = view === "back";
  if (behind) {
    drawArm(ctx, SHOULDER_L, p.freeHand, look);
    drawArm(ctx, SHOULDER_R, p.batHand, look);
  }
  drawBody(ctx, look, view);
  drawHead(ctx, look, view, p.eyes);
  if (!behind) {
    drawArm(ctx, SHOULDER_L, p.freeHand, look);
    drawArm(ctx, SHOULDER_R, p.batHand, look);
  }
  circle(ctx, p.freeHand, 13, look.frame);
  drawBat(ctx, p.batHand, look.bat);
  circle(ctx, p.batHand, 13, look.frame);
  ctx.restore();
};

/** Posisi horizontal tangan pemegang bat (px kanvas, 0 = kiri) untuk pose tertentu. */
export const batHandX = (pose: Pose): number => POSES[pose].batHand.x;

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

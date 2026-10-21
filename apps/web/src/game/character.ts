// Karakter robot maskot digambar prosedural dengan Canvas 2D: tidak ada file sprite yang
// diunduh, dan warna kustom cukup menggambar ulang. Gaya: badan mengilap berbentuk telur,
// kepala bertelinga runcing dengan layar wajah gelap dan mata bulat menyala, lengan bersegmen
// yang melayang terpisah dari badan, tangan gelap tiga jari, garis aksen berwarna. Gradasi
// lembut tanpa garis tinta tebal agar terlihat seperti mainan plastik.

export const FRAMES = ["#f4f6fb", "#5a5f70", "#f1d58a", "#c9f2e6", "#d9d0ff", "#ffd1e6"];
export const ARMORS = ["#2f9bff", "#ff2e9a", "#c6ff3d", "#ff8a00", "#8b5cf6", "#3de8ff"];
export const VISORS = ["#3fb6ff", "#c6ff3d", "#ff2e9a", "#ffd23d", "#ffffff", "#ff5a5a"];
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

const SCREEN = "#14101f";
const HAND = "#1c1a24";
const OUTLINE = "#3a4060";

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
  idle: { batHand: { x: 200, y: 280 }, freeHand: { x: 56, y: 280 }, lean: 0, bob: 0, eyes: "normal" },
  ready: { batHand: { x: 210, y: 248 }, freeHand: { x: 48, y: 256 }, lean: 0, bob: 6, eyes: "normal" },
  forehand: { batHand: { x: 222, y: 210 }, freeHand: { x: 52, y: 262 }, lean: 0.08, bob: 4, eyes: "right" },
  backhand: { batHand: { x: 46, y: 222 }, freeHand: { x: 70, y: 282 }, lean: -0.08, bob: 4, eyes: "left" },
  smash: { batHand: { x: 216, y: 120 }, freeHand: { x: 44, y: 230 }, lean: -0.05, bob: -6, eyes: "fierce" },
  serve: { batHand: { x: 208, y: 276 }, freeHand: { x: 56, y: 160 }, lean: 0, bob: 0, eyes: "wink" },
  win: { batHand: { x: 220, y: 130 }, freeHand: { x: 36, y: 130 }, lean: 0, bob: -12, eyes: "happy" },
  lose: { batHand: { x: 184, y: 318 }, freeHand: { x: 72, y: 318 }, lean: 0, bob: 12, eyes: "sad" },
};

const SHOULDER_L: Point = { x: 76, y: 200 };
const SHOULDER_R: Point = { x: 180, y: 200 };
const PIVOT: Point = { x: 128, y: 330 };

const hexToRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(r1, r2)}, ${c(g1, g2)}, ${c(b1, b2)})`;
};

const shadeOf = (c: string, t = 0.35) => mix(c, "#55608a", t);
const lightOf = (c: string, t = 0.6) => mix(c, "#ffffff", t);

/** Isi path aktif dengan gradasi plastik mengilap (terang di kiri atas) dan tepi lembut. */
const glossFill = (
  ctx: CanvasRenderingContext2D,
  color: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, lightOf(color));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shadeOf(color));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = mix(color, OUTLINE, 0.55);
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.stroke();
};

const shine = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.fill();
};

const line = (ctx: CanvasRenderingContext2D, color: string, width: number) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
};

const drawHover = (ctx: CanvasRenderingContext2D, look: Look) => {
  const glow = ctx.createRadialGradient(128, 352, 4, 128, 352, 70);
  glow.addColorStop(0, `${look.visor}aa`);
  glow.addColorStop(1, `${look.visor}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(128, 352, 70, 14, 0, 0, Math.PI * 2);
  ctx.fill();
};

const earPath = (ctx: CanvasRenderingContext2D, s: number, scale: number) => {
  const at = (x: number, y: number): [number, number] => [128 + s * x, y];
  // Telinga dalam diperkecil ke arah titik tengah telinga.
  const k = (x: number, y: number): [number, number] => {
    const [cx, cy] = [44, 62];
    return at(cx + (x - cx) * scale, cy + (y - cy) * scale);
  };
  ctx.beginPath();
  ctx.moveTo(...k(68, 104));
  ctx.quadraticCurveTo(...k(74, 50), ...k(62, 22));
  ctx.quadraticCurveTo(...k(40, 30), ...k(18, 64));
  ctx.closePath();
};

const drawEars = (ctx: CanvasRenderingContext2D, look: Look, view: View) => {
  for (const s of [-1, 1]) {
    earPath(ctx, s, 1);
    glossFill(ctx, look.frame, 128 + s * 20, 22, 128 + s * 70, 104);
    if (view === "front") {
      earPath(ctx, s, 0.55);
      ctx.fillStyle = look.armor;
      ctx.fill();
    }
  }
};

const drawEyes = (ctx: CanvasRenderingContext2D, color: string, eyes: Eyes) => {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  if (eyes === "happy" || eyes === "sad") {
    for (const x of [106, 150]) {
      ctx.beginPath();
      if (eyes === "happy") ctx.arc(x, 122, 11, Math.PI * 1.15, Math.PI * 1.85);
      else ctx.arc(x, 106, 11, Math.PI * 0.15, Math.PI * 0.85);
      line(ctx, color, 6);
    }
    ctx.restore();
    return;
  }
  const shift = eyes === "left" ? -6 : eyes === "right" ? 6 : 0;
  const centers: Point[] = [
    { x: 106 + shift, y: 116 },
    { x: 150 + shift, y: 116 },
  ];
  ctx.fillStyle = color;
  if (eyes === "wink") {
    ctx.beginPath();
    ctx.arc(centers[0]!.x, 116, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(139, 118);
    ctx.quadraticCurveTo(150, 110, 161, 118);
    line(ctx, color, 5);
  } else {
    for (const c of centers) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // Garis pindai tipis dan kilau kecil membuat mata terlihat seperti layar.
  const lit = eyes === "wink" ? centers.slice(0, 1) : centers;
  for (const c of lit) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, 13, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(20, 16, 31, 0.22)";
    for (let y = c.y - 12; y < c.y + 13; y += 4) ctx.fillRect(c.x - 13, y, 26, 1.5);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(c.x - 4, c.y - 5, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fill();
  }
  if (eyes === "fierce") {
    // Kelopak miring menutup sisi dalam atas mata.
    ctx.fillStyle = SCREEN;
    ctx.beginPath();
    ctx.moveTo(90, 98);
    ctx.lineTo(124, 112);
    ctx.lineTo(124, 98);
    ctx.moveTo(166, 98);
    ctx.lineTo(132, 112);
    ctx.lineTo(132, 98);
    ctx.fill();
  }
};

const drawMouth = (ctx: CanvasRenderingContext2D, color: string, eyes: Eyes) => {
  ctx.beginPath();
  if (eyes === "sad") ctx.arc(128, 146, 7, Math.PI * 1.2, Math.PI * 1.8);
  else if (eyes === "fierce") {
    ctx.moveTo(122, 140);
    ctx.lineTo(134, 140);
  } else ctx.arc(128, 134, eyes === "happy" ? 9 : 6, Math.PI * 0.2, Math.PI * 0.8);
  line(ctx, color, 3);
};

const drawHead = (ctx: CanvasRenderingContext2D, look: Look, view: View, eyes: Eyes) => {
  drawEars(ctx, look, view);
  ctx.beginPath();
  ctx.roundRect(58, 46, 140, 124, 56);
  glossFill(ctx, look.frame, 70, 50, 190, 170);
  if (view === "back") {
    // Garis V dan garis tengah di belakang kepala.
    ctx.beginPath();
    ctx.moveTo(92, 66);
    ctx.lineTo(128, 96);
    ctx.lineTo(164, 66);
    ctx.moveTo(128, 96);
    ctx.lineTo(128, 160);
    line(ctx, look.armor, 7);
    shine(ctx, 90, 72, 18, 9);
    return;
  }
  shine(ctx, 84, 66, 14, 7);
  ctx.beginPath();
  ctx.moveTo(98, 54);
  ctx.lineTo(98, 66);
  ctx.moveTo(158, 54);
  ctx.lineTo(158, 66);
  line(ctx, look.armor, 5);
  // Layar wajah gelap dengan tepi atas sedikit bergelombang.
  ctx.beginPath();
  ctx.moveTo(78, 108);
  ctx.quadraticCurveTo(78, 82, 102, 80);
  ctx.quadraticCurveTo(128, 86, 154, 80);
  ctx.quadraticCurveTo(178, 82, 178, 108);
  ctx.lineTo(178, 126);
  ctx.quadraticCurveTo(178, 154, 150, 154);
  ctx.lineTo(106, 154);
  ctx.quadraticCurveTo(78, 154, 78, 126);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 80, 0, 154);
  g.addColorStop(0, "#241d36");
  g.addColorStop(1, SCREEN);
  ctx.fillStyle = g;
  ctx.fill();
  drawEyes(ctx, look.visor, eyes);
  drawMouth(ctx, look.visor, eyes);
};

const bodyPath = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  ctx.moveTo(128, 172);
  ctx.bezierCurveTo(176, 172, 184, 250, 176, 280);
  ctx.bezierCurveTo(168, 312, 148, 328, 128, 328);
  ctx.bezierCurveTo(108, 328, 88, 312, 80, 280);
  ctx.bezierCurveTo(72, 250, 80, 172, 128, 172);
  ctx.closePath();
};

const drawBody = (ctx: CanvasRenderingContext2D, look: Look, view: View) => {
  bodyPath(ctx);
  glossFill(ctx, look.frame, 84, 180, 176, 320);
  shine(ctx, 102, 224, 9, 20);
  if (view === "back") {
    ctx.beginPath();
    ctx.moveTo(94, 194);
    ctx.quadraticCurveTo(128, 216, 162, 194);
    line(ctx, look.armor, 7);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(102, 186);
  ctx.lineTo(128, 206);
  ctx.lineTo(154, 186);
  line(ctx, look.armor, 6);
  // Emblem PinkPonk: bola menyala di dada.
  ctx.beginPath();
  ctx.arc(128, 246, 15, 0, Math.PI * 2);
  glossFill(ctx, look.armor, 116, 234, 140, 260);
  ctx.save();
  ctx.shadowColor = look.visor;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(128, 246, 6, 0, Math.PI * 2);
  ctx.fillStyle = look.visor;
  ctx.fill();
  ctx.restore();
};

const segment = (ctx: CanvasRenderingContext2D, a: Point, b: Point, w: number, look: Look) => {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  line(ctx, mix(look.frame, OUTLINE, 0.55), w + 4);
  line(ctx, shadeOf(look.frame), w);
  line(ctx, look.frame, w * 0.7);
  // Pita aksen di tengah segmen.
  const m = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const p = m(0.45);
  const q = m(0.6);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.lineCap = "butt";
  ctx.strokeStyle = look.armor;
  ctx.lineWidth = w;
  ctx.stroke();
};

/** Tangan gelap tiga jari; `dir` adalah arah jari (radian, sumbu y kanvas ke bawah). */
const drawHand = (
  ctx: CanvasRenderingContext2D,
  at: Point,
  dir: number,
  view: View,
  look: Look,
) => {
  ctx.fillStyle = HAND;
  for (const off of [-0.7, 0, 0.7]) {
    ctx.beginPath();
    ctx.arc(at.x + Math.cos(dir + off) * 11, at.y + Math.sin(dir + off) * 11, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(at.x, at.y, 12, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(at.x - 4, at.y - 4, 1, at.x, at.y, 12);
  g.addColorStop(0, "#4a4658");
  g.addColorStop(1, HAND);
  ctx.fillStyle = g;
  ctx.fill();
  if (view === "back") {
    ctx.beginPath();
    ctx.arc(at.x, at.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = look.armor;
    ctx.fill();
  }
};

const handDir = (hand: Point, from: Point) => Math.atan2(hand.y - from.y, hand.x - from.x);

const drawArm = (ctx: CanvasRenderingContext2D, from: Point, to: Point, look: Look) => {
  const at = (t: number): Point => ({
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  });
  // Celah antarsegmen sengaja dibiarkan: lengan melayang tanpa sendi yang terlihat.
  segment(ctx, at(0), at(0.34), 15, look);
  segment(ctx, at(0.44), at(0.84), 22, look);
};

const drawBat = (ctx: CanvasRenderingContext2D, hand: Point, head: Point, color: string) => {
  ctx.beginPath();
  ctx.moveTo(hand.x, hand.y);
  ctx.lineTo(head.x, head.y);
  line(ctx, "#9b6e45", 9);
  line(ctx, "#d9a066", 5);
  ctx.beginPath();
  ctx.arc(head.x, head.y, 23, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = mix(color, "#000000", 0.35);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(head.x - 6, head.y - 6, 10, Math.PI * 1.1, Math.PI * 1.6);
  line(ctx, "rgba(255, 255, 255, 0.5)", 4);
};

/** Bat condong ke luar badan, makin jauh tangan dari tengah makin miring (radian dari tegak). */
export const batTilt = (handX: number): number =>
  Math.max(-1, Math.min(1, (handX - CANVAS_W / 2) / 70)) * 0.46;

/** Jarak tangan ke pusat kepala bat (px kanvas). */
export const BAT_REACH = 27;

export const drawCharacter = (
  ctx: CanvasRenderingContext2D,
  look: Look,
  pose: Pose,
  view: View,
  /** false = lengan pemegang bat tidak digambar (di game dianimasikan terpisah). */
  withBatArm = true,
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
  // Dari belakang tangan bebas tertutup badan; tangan pemegang bat selalu di depan agar
  // arah pukulan terbaca.
  if (view === "back") drawArm(ctx, SHOULDER_L, p.freeHand, look);
  drawBody(ctx, look, view);
  if (view === "front") drawArm(ctx, SHOULDER_L, p.freeHand, look);
  drawHand(ctx, p.freeHand, handDir(p.freeHand, SHOULDER_L), view, look);
  if (withBatArm) {
    const t = batTilt(p.batHand.x);
    const head = {
      x: p.batHand.x + Math.sin(t) * BAT_REACH,
      y: p.batHand.y - Math.cos(t) * BAT_REACH,
    };
    drawArm(ctx, SHOULDER_R, p.batHand, look);
    drawBat(ctx, p.batHand, head, look.bat);
    drawHand(ctx, p.batHand, handDir(p.batHand, SHOULDER_R), view, look);
  }
  drawHead(ctx, look, view, p.eyes);
  ctx.restore();
};

export interface BatArmPose {
  shoulder: Point;
  hand: Point;
}

/** Bahu dan tangan pemegang bat (px kanvas belum dicerminkan) setelah condong dan naik-turun pose. */
export const batArmPose = (pose: Pose): BatArmPose => {
  const p = POSES[pose];
  const c = Math.cos(p.lean);
  const s = Math.sin(p.lean);
  const place = (q: Point): Point => {
    const dx = q.x - PIVOT.x;
    const dy = q.y - PIVOT.y;
    return { x: PIVOT.x + dx * c - dy * s, y: PIVOT.y + p.bob + dx * s + dy * c };
  };
  return { shoulder: place(SHOULDER_R), hand: place(p.batHand) };
};

/** Panjang segmen lengan pada tekstur (px antar pusat ujung), lihat drawArmSegment. */
export const SEGMENT_LEN = 48;
export const SEGMENT_CANVAS: Readonly<{ w: number; h: number }> = { w: 80, h: 32 };
export const UPPER_ARM_W = 15;
export const FOREARM_W = 22;

/** Satu segmen lengan mendatar di tengah kanvas SEGMENT_CANVAS. */
export const drawArmSegment = (ctx: CanvasRenderingContext2D, width: number, look: Look): void => {
  ctx.clearRect(0, 0, SEGMENT_CANVAS.w, SEGMENT_CANVAS.h);
  const y = SEGMENT_CANVAS.h / 2;
  const x0 = (SEGMENT_CANVAS.w - SEGMENT_LEN) / 2;
  segment(ctx, { x: x0, y }, { x: x0 + SEGMENT_LEN, y }, width, look);
};

export const BAT_CANVAS: Readonly<{ w: number; h: number }> = { w: 96, h: 104 };
/** Letak tangan di kanvas BAT_CANVAS; bat menghadap ke atas dari titik ini. */
export const BAT_GRIP: Readonly<Point> = { x: 48, y: 80 };

export const drawBatHand = (ctx: CanvasRenderingContext2D, look: Look, view: View): void => {
  ctx.clearRect(0, 0, BAT_CANVAS.w, BAT_CANVAS.h);
  drawBat(ctx, BAT_GRIP, { x: BAT_GRIP.x, y: BAT_GRIP.y - BAT_REACH }, look.bat);
  drawHand(ctx, BAT_GRIP, -Math.PI / 2, view, look);
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
  frame: mine.frame === FRAMES[1] ? FRAMES[0]! : FRAMES[1]!,
  armor: mine.armor === ARMORS[1] ? ARMORS[5]! : ARMORS[1]!,
  visor: mine.visor === VISORS[2] ? VISORS[1]! : VISORS[2]!,
  bat: BATS[1]!,
});

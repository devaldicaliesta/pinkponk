// Efek suara disintesis dengan Web Audio: nol byte aset audio yang diunduh.

export type Sfx =
  | "bounce"
  | "hit"
  | "smash"
  | "net"
  | "perfect"
  | "great"
  | "miss"
  | "win"
  | "lose"
  | "beep"
  | "go"
  | "fever"
  | "spin"
  | "ability"
  | "jinx"
  | "shield"
  | "stackFull"
  | "loop"
  | "chop"
  | "drop"
  | "moment";

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let enabled = true;

export const setSoundEnabled = (on: boolean): void => {
  enabled = on;
};

/** Harus dipanggil dari interaksi pengguna (aturan autoplay browser). */
export const unlockAudio = (): void => {
  try {
    ctx ??= new AudioContext({ latencyHint: "interactive" });
    if (ctx.state === "suspended") void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
  } catch {
    ctx = null;
  }
};

const tone = (
  c: AudioContext,
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  delay = 0,
  endFreq?: number,
) => {
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
};

const burst = (c: AudioContext, dur: number, gain: number, freq: number) => {
  if (!noise) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
};

export const play = (sfx: Sfx): void => {
  if (!enabled || !ctx || ctx.state !== "running") return;
  const c = ctx;
  switch (sfx) {
    case "bounce":
      tone(c, 1900, 0.05, "sine", 0.25);
      burst(c, 0.02, 0.15, 3000);
      break;
    case "hit":
      tone(c, 900, 0.07, "triangle", 0.3);
      burst(c, 0.04, 0.2, 2000);
      break;
    case "smash":
      tone(c, 320, 0.18, "square", 0.18, 0, 90);
      burst(c, 0.14, 0.35, 1200);
      break;
    case "net":
      tone(c, 180, 0.12, "sine", 0.3);
      break;
    case "perfect":
      tone(c, 1320, 0.12, "sine", 0.22);
      tone(c, 1760, 0.18, "sine", 0.22, 0.07);
      break;
    case "great":
      tone(c, 1175, 0.12, "sine", 0.18);
      break;
    case "miss":
      tone(c, 220, 0.2, "sawtooth", 0.08, 0, 150);
      break;
    case "win":
      [660, 880, 1320].forEach((f, i) => {
        tone(c, f, 0.14, "triangle", 0.2, i * 0.08);
      });
      break;
    case "lose":
      [440, 330].forEach((f, i) => {
        tone(c, f, 0.18, "triangle", 0.18, i * 0.1);
      });
      break;
    case "beep":
      tone(c, 880, 0.1, "square", 0.08);
      break;
    case "go":
      tone(c, 1320, 0.2, "square", 0.1);
      break;
    case "fever":
      [880, 1100, 1320, 1760].forEach((f, i) => {
        tone(c, f, 0.1, "square", 0.08, i * 0.05);
      });
      break;
    case "spin":
      // Detak roulette yang melambat.
      [0, 0.06, 0.13, 0.21, 0.31, 0.43, 0.58, 0.76].forEach((d, i) => {
        tone(c, 1500 - i * 60, 0.03, "square", 0.05, d);
      });
      break;
    case "ability":
      tone(c, 523, 0.12, "triangle", 0.2);
      tone(c, 784, 0.16, "triangle", 0.2, 0.08);
      tone(c, 1047, 0.24, "triangle", 0.2, 0.16);
      break;
    case "jinx":
      tone(c, 400, 0.4, "sawtooth", 0.08, 0, 120);
      break;
    case "shield":
      tone(c, 1200, 0.2, "sine", 0.2, 0, 2400);
      break;
    case "stackFull":
      tone(c, 988, 0.08, "square", 0.08);
      tone(c, 1319, 0.12, "square", 0.08, 0.08);
      break;
    // Tiap jenis pukulan punya warna bunyi sendiri agar spin terdengar sebelum terlihat.
    case "loop":
      tone(c, 700, 0.1, "triangle", 0.22, 0, 1400);
      burst(c, 0.06, 0.2, 3500);
      break;
    case "chop":
      tone(c, 1100, 0.1, "triangle", 0.2, 0, 500);
      burst(c, 0.05, 0.18, 1400);
      break;
    case "drop":
      tone(c, 1500, 0.04, "sine", 0.16);
      break;
    case "moment":
      [1047, 1319, 1568].forEach((f, i) => {
        tone(c, f, 0.12, "sine", 0.16, i * 0.05);
      });
      break;
  }
};

export const vibrate = (pattern: number | number[], on: boolean): void => {
  if (!on) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Tidak didukung (misalnya iOS Safari).
  }
};

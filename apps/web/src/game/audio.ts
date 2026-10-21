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
  | "fever";

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

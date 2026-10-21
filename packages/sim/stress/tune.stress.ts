import { it } from "vitest";
import {
  AI_PROFILES,
  AiController,
  type AiProfile,
  aiSkill,
  BAT_SPEED,
  type Difficulty,
  Match,
  type Personality,
  type PlayMode,
} from "../src";

// Alat kalibrasi (dijalankan manual): persentase menang, panjang reli, dan penyebab poin
// antar tingkat/kepribadian AI. "proxy" = pemain tiruan dengan bat secepat manusia.
const PROXY: AiProfile = {
  reactionMs: 190,
  errorM: 0.09,
  speed: BAT_SPEED,
  powerMin: 0.3,
  powerMax: 0.7,
  tactics: 0.3,
  aggression: 0.3,
  recover: 0.3,
  rallyHeat: 0,
  control: 1,
  whiff: 0.02,
  tapSigmaMs: 45,
  serveDelayMs: [500, 900],
};
(AI_PROFILES as Record<string, AiProfile>).proxy = PROXY;
// TUNE='{"legend":{"control":0.4}}' menimpa profil sementara untuk percobaan.
for (const [d, o] of Object.entries(JSON.parse(process.env.TUNE ?? "{}"))) {
  Object.assign((AI_PROFILES as Record<string, AiProfile>)[d] ?? {}, o);
}

const parse = (spec: string) => {
  const [d, p] = spec.split("/") as [Difficulty, Personality | undefined];
  return { d, p: p ?? "allround" };
};

const duel = (specA: string, specB: string, mode: PlayMode, n: number) => {
  const a = parse(specA);
  const b = parse(specB);
  const sa = aiSkill(a.d, a.p);
  const sb = aiSkill(b.d, b.p);
  let winsA = 0;
  let rallies = 0;
  let points = 0;
  let smashes = 0;
  const lostA: Record<string, number> = {};
  const lostB: Record<string, number> = {};
  for (let s = 1; s <= n; s++) {
    const m = new Match({
      mode,
      bestOf: 1,
      seed: s * 97,
      skipCountdown: true,
      batSpeed: [sa.speed, sb.speed],
      control: [sa.control, sb.control],
    });
    const ai = [new AiController(0, a.d, s * 3, a.p), new AiController(1, b.d, s * 5, b.p)];
    for (let i = 0; i < 120 * 60 * 20 && m.phase !== "over"; i++) {
      m.pushInput(0, ai[0]!.input(m));
      m.pushInput(1, ai[1]!.input(m));
      m.step();
      for (const e of m.events) {
        if (e.type === "point" && e.reason !== "let") {
          points++;
          rallies += m.rally?.hits ?? 0;
          const lost = e.winner === 1 ? lostA : lostB;
          lost[e.reason] = (lost[e.reason] ?? 0) + 1;
        }
        if (e.type === "hit" && e.shot === "smash") smashes++;
      }
    }
    if (m.winner === 0) winsA++;
  }
  return (
    `${mode} ${specA} vs ${specB}: ${Math.round((winsA / n) * 100)}% menang, ` +
    `reli ${(rallies / points).toFixed(1)}, smash/poin ${(smashes / points).toFixed(2)}, ` +
    `hilang A ${JSON.stringify(lostA)} B ${JSON.stringify(lostB)}`
  );
};

// Hanya berjalan bila PAIRS diisi, agar tidak ikut `pnpm test:stress` biasa.
it.skipIf(!process.env.PAIRS)("kalibrasi", async () => {
  const pairs = (process.env.PAIRS ?? "")
    .split(",")
    .map((p) => p.split(":"));
  for (const mode of (process.env.MODES ?? "swing").split(",") as PlayMode[]) {
    for (const [a, b] of pairs) {
      console.log(duel(a!, b!, mode, Number(process.env.N ?? 40)));
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}, 1_800_000);

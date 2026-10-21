// Chunk game: dimuat hanya saat pertandingan dimulai (berisi Three.js).
import "../styles/game.css";
import type { RoomConfig } from "@pinkponk/protocol";
import type { BestOf, Difficulty, PlayMode, Side } from "@pinkponk/sim";
import type { NetClient } from "../net/client";
import { getSettings } from "../state/settings";
import { CombinedInput, KEYS_P1, KEYS_P2, KEYS_SOLO } from "./input";
import { LocalSession } from "./local-session";
import { OnlineSession } from "./online-session";

export { default as GameView } from "./GameView";

const surface = () => document.body;

export const createAiSession = (
  mode: PlayMode,
  bestOf: BestOf,
  difficulty: Difficulty,
  names: [string, string],
) =>
  new LocalSession({
    mode,
    bestOf,
    difficulty,
    names,
    inputs: [
      new CombinedInput({ element: surface(), keys: KEYS_SOLO, pointer: true, gamepad: true }),
      null,
    ],
    calibrationMs: getSettings().calibrationMs,
  });

export const createLocalSession = (bestOf: BestOf, names: [string, string]) =>
  new LocalSession({
    mode: "swing",
    bestOf,
    difficulty: null,
    names,
    inputs: [
      new CombinedInput({ element: surface(), keys: KEYS_P1, pointer: false, gamepad: true }),
      new CombinedInput({ element: surface(), keys: KEYS_P2, pointer: false, gamepad: false }),
    ],
    calibrationMs: 0,
  });

export const createOnlineSession = (
  client: NetClient,
  you: Side,
  names: [string, string],
  config: RoomConfig,
) =>
  new OnlineSession(
    client,
    you,
    names,
    config,
    new CombinedInput({ element: surface(), keys: KEYS_SOLO, pointer: true, gamepad: true }),
    getSettings().calibrationMs,
  );

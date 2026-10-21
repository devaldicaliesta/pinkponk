import { BAT_MAX_X, MS_PER_TICK, TICK_RATE } from "./constants";
import type { PlayerInput } from "./types";
import { clamp } from "./vec";

const MAX_VIEW_LAG_TICKS = 2 * TICK_RATE;
const MAX_TAP_AGE_MS = 600;

const finite = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Batasi semua nilai input ke rentang sah. Input dari jaringan tidak dipercaya:
 * tick tampilan tidak boleh di masa depan, dan waktu tap tidak boleh di masa depan
 * atau terlalu lama di masa lalu.
 */
export const sanitizeInput = (raw: PlayerInput, nowTick: number): PlayerInput => {
  const viewTick = Math.round(
    clamp(finite(raw.viewTick, nowTick), nowTick - MAX_VIEW_LAG_TICKS, nowTick),
  );
  const nowMs = nowTick * MS_PER_TICK;
  let tapMs: number | null = null;
  if (raw.tapMs !== null && Number.isFinite(raw.tapMs)) {
    const t = raw.tapMs as number;
    if (t <= nowMs + MS_PER_TICK && t >= nowMs - MAX_TAP_AGE_MS) tapMs = t;
  }
  return {
    viewTick,
    x: clamp(finite(raw.x), -BAT_MAX_X, BAT_MAX_X),
    aim: clamp(finite(raw.aim), -1, 1),
    lift: clamp(finite(raw.lift), -1, 1),
    power: clamp(finite(raw.power), 0, 1),
    serve: raw.serve === true,
    tapMs,
    ability: raw.ability === true,
  };
};

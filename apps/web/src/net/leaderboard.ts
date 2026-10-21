import { playerId } from "../state/player";

export interface Ranked {
  rank: number;
  name: string;
  rating: number;
  wins: number;
  losses: number;
}

const isRanked = (v: unknown): v is Ranked => {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.rank === "number" &&
    typeof r.name === "string" &&
    typeof r.rating === "number" &&
    typeof r.wins === "number" &&
    typeof r.losses === "number"
  );
};

export const fetchLeaderboard = async (): Promise<{ top: Ranked[]; me: Ranked | null }> => {
  const id = await playerId();
  const [topRes, meRes] = await Promise.all([
    fetch("/api/leaderboard"),
    fetch(`/api/leaderboard/me?id=${id}`),
  ]);
  if (!topRes.ok) throw new Error(topRes.status === 429 ? "rate-limited" : "network");
  const topData = (await topRes.json()) as { top?: unknown };
  const top = Array.isArray(topData.top) ? topData.top.filter(isRanked).slice(0, 50) : [];
  let me: Ranked | null = null;
  if (meRes.ok) {
    const meData = (await meRes.json()) as { me?: unknown };
    me = isRanked(meData.me) ? meData.me : null;
  }
  return { top, me };
};

import type { Leaderboard } from "./leaderboard";
import type { Matchmaker } from "./matchmaker";
import type { Room } from "./room";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  LEADERBOARD: DurableObjectNamespace<Leaderboard>;
  MATCHMAKER: DurableObjectNamespace<Matchmaker>;
  ASSETS: Fetcher;
  /** Daftar origin yang boleh memanggil API/WebSocket, dipisah koma. */
  ALLOWED_ORIGINS: string;
  RL_ROOM?: RateLimit;
  RL_JOIN?: RateLimit;
  RL_EVENT?: RateLimit;
  RL_LB?: RateLimit;
  EVENTS?: AnalyticsEngineDataset;
}

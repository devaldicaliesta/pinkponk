import type { Room } from "./room";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  /** Daftar origin yang boleh memanggil API/WebSocket, dipisah koma. */
  ALLOWED_ORIGINS: string;
  RL_ROOM?: RateLimit;
  RL_JOIN?: RateLimit;
  RL_EVENT?: RateLimit;
  EVENTS?: AnalyticsEngineDataset;
}

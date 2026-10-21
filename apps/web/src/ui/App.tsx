import { isRoomCode } from "@pinkponk/protocol";
import type { BestOf, Difficulty, PlayMode } from "@pinkponk/sim";
import { useState } from "preact/hooks";
import type { Session } from "../game/session";
import { getSettings, useSettings } from "../state/settings";
import { HowTo } from "./screens/HowTo";
import { Leaderboard } from "./screens/Leaderboard";
import { Lobby, type OnlineStart } from "./screens/Lobby";
import { Nickname } from "./screens/Nickname";
import { Settings } from "./screens/Settings";
import { Setup, type SetupResult } from "./screens/Setup";
import { type MenuMode, Title } from "./screens/Title";

type GameModule = typeof import("../game");

type Screen =
  | { name: "title" }
  | { name: "nickname"; next: Screen }
  | { name: "howto"; next: Screen }
  | { name: "setup"; mode: "ai" | "timing" | "local" | "gamble" }
  | { name: "online"; code: string | null; mode: PlayMode }
  | { name: "settings" }
  | { name: "leaderboard" }
  | { name: "loading" }
  | { name: "game"; session: Session; module: GameModule };

const codeFromPath = (): string | null => {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{6})$/);
  const code = m?.[1]?.toUpperCase() ?? null;
  return code && isRoomCode(code) ? code : null;
};

const initialScreen = (): Screen => {
  const code = codeFromPath();
  const target: Screen = code ? { name: "online", code, mode: "swing" } : { name: "title" };
  return getSettings().nickname ? target : { name: "nickname", next: target };
};

const loadGame = (): Promise<GameModule> => import("../game");

export const App = () => {
  const settings = useSettings();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const nick = settings.nickname ?? "Player";
  const toTitle = () => {
    history.replaceState(null, "", "/");
    setScreen({ name: "title" });
  };

  const startLocal = async (mode: "ai" | "timing" | "local" | "gamble", r: SetupResult) => {
    setScreen({ name: "loading" });
    const module = await loadGame();
    const bestOf: BestOf = r.bestOf;
    const difficulty: Difficulty = r.difficulty;
    const session =
      mode === "local"
        ? module.createLocalSession(bestOf, ["P1", "P2"])
        : module.createAiSession(
            mode === "timing" || (mode === "gamble" && r.style === "timing") ? "timing" : "swing",
            bestOf,
            difficulty,
            [nick, "AI"],
            mode === "gamble",
            r.personality,
          );
    setScreen({ name: "game", session, module });
  };

  const startOnline = async (s: OnlineStart) => {
    const module = await loadGame();
    const session = module.createOnlineSession(s.client, s.you, s.names, s.config);
    setScreen({ name: "game", session, module });
  };

  const pickMode = (m: MenuMode) => {
    const target: Screen =
      m === "online" ? { name: "online", code: null, mode: "swing" } : { name: "setup", mode: m };
    setScreen(settings.tutorialDone || m === "online" ? target : { name: "howto", next: target });
    // Unduh chunk game lebih awal selagi pemain memilih pengaturan.
    void loadGame();
  };

  switch (screen.name) {
    case "title":
      return (
        <Title
          onMode={pickMode}
          onSettings={() => setScreen({ name: "settings" })}
          onHowTo={() => setScreen({ name: "howto", next: { name: "title" } })}
          onNickname={() => setScreen({ name: "nickname", next: { name: "title" } })}
          onLeaderboard={() => setScreen({ name: "leaderboard" })}
        />
      );
    case "leaderboard":
      return <Leaderboard onBack={toTitle} />;
    case "nickname":
      return (
        <Nickname
          onDone={() => setScreen(screen.next)}
          onBack={settings.nickname ? () => setScreen(screen.next) : undefined}
        />
      );
    case "howto":
      return <HowTo onDone={() => setScreen(screen.next)} />;
    case "setup":
      return (
        <Setup
          mode={screen.mode}
          onBack={toTitle}
          onStart={(r) => void startLocal(screen.mode, r)}
        />
      );
    case "online":
      return (
        <Lobby
          initialCode={screen.code}
          initialMode={screen.mode}
          initialGamble={false}
          onBack={toTitle}
          onStart={(s) => void startOnline(s)}
        />
      );
    case "settings":
      return (
        <Settings
          onBack={toTitle}
          onNickname={() => setScreen({ name: "nickname", next: { name: "settings" } })}
        />
      );
    case "loading":
      return <main class="screen" aria-busy="true" />;
    case "game": {
      const { GameView } = screen.module;
      return (
        <GameView
          session={screen.session}
          onExit={() => {
            screen.session.dispose();
            toTitle();
          }}
        />
      );
    }
  }
};

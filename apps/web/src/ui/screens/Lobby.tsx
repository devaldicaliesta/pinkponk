import { isRoomCode, type RoomConfig, type ServerControl } from "@pinkponk/protocol";
import type { BestOf, PlayMode, Side } from "@pinkponk/sim";
import { useEffect, useRef, useState } from "preact/hooks";
import { useT } from "../../i18n";
import { createRoom, NetClient, type NetError } from "../../net/client";
import { shareText } from "../../share";
import { getSettings } from "../../state/settings";
import { Chips } from "../components/Chips";
import { TopBar } from "../components/TopBar";

export interface OnlineStart {
  client: NetClient;
  you: Side;
  names: [string, string];
  config: RoomConfig;
}

interface Props {
  initialCode: string | null;
  initialMode: PlayMode;
  onStart(s: OnlineStart): void;
  onBack(): void;
}

type Phase = "choose" | "connecting" | "waiting";

export const roomLink = (code: string) => `${location.origin}/r/${code}`;

export const Lobby = ({ initialCode, initialMode, onStart, onBack }: Props) => {
  const t = useT();
  const [mode, setMode] = useState<PlayMode>(initialMode);
  const [bestOf, setBestOf] = useState<BestOf>(3);
  const [code, setCode] = useState(initialCode ?? "");
  const [phase, setPhase] = useState<Phase>("choose");
  const [error, setError] = useState<NetError | null>(null);
  const [players, setPlayers] = useState<[string | null, string | null]>([null, null]);
  const [toast, setToast] = useState<string | null>(null);
  const client = useRef<NetClient | null>(null);
  const started = useRef(false);
  const you = useRef<Side>(0);

  useEffect(
    () => () => {
      if (!started.current) client.current?.close();
    },
    [],
  );

  const connect = (roomCode: string, create: boolean) => {
    setError(null);
    setPhase("connecting");
    const config: RoomConfig = { mode, bestOf };
    const c = new NetClient(roomCode, getSettings().nickname ?? "Player", create, config, {
      onControl: (m: ServerControl) => {
        if (m.t === "welcome") {
          you.current = m.you;
          setCode(m.code);
          setPhase("waiting");
          history.replaceState(null, "", `/r/${m.code}`);
        } else if (m.t === "lobby") {
          setPlayers(m.players);
          setMode(m.config.mode);
          setBestOf(m.config.bestOf);
        } else if (m.t === "start") {
          started.current = true;
          onStart({ client: c, you: you.current, names: m.players, config: m.config });
        } else if (m.t === "error") {
          setError(m.code);
        }
      },
      onSnapshot: () => {},
      onClose: (e) => {
        if (e) {
          setError(e);
          setPhase("choose");
        }
      },
    });
    client.current?.close();
    client.current = c;
    c.connect();
  };

  // Datang dari link /r/KODE: langsung gabung.
  useEffect(() => {
    if (initialCode && isRoomCode(initialCode)) connect(initialCode, false);
  }, []);

  const create = async () => {
    setError(null);
    setPhase("connecting");
    try {
      connect(await createRoom(), true);
    } catch (e) {
      setError((e as Error).message === "rate-limited" ? "rate-limited" : "network");
      setPhase("choose");
    }
  };

  const leave = () => {
    client.current?.close();
    client.current = null;
    history.replaceState(null, "", "/");
    setPhase("choose");
    setPlayers([null, null]);
  };

  const share = async () => {
    const result = await shareText(t("lobby.shareText", { code }), roomLink(code));
    if (result === "copied") {
      setToast(t("lobby.copied"));
      setTimeout(() => setToast(null), 1800);
    }
  };

  const normalizedCode = code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

  return (
    <main class="screen">
      <div class="screen__inner">
        <TopBar onBack={phase === "choose" ? onBack : leave} />
        <h1 class="display screen-title">{t("lobby.title")}</h1>
        {error && (
          <p class="field__error" role="alert" data-testid="lobby-error">
            {t(`lobby.err.${error}`)}
          </p>
        )}

        {phase === "choose" && (
          <>
            <section class="card stack">
              <Chips
                label={t("lobby.mode")}
                value={mode}
                onChange={(v) => setMode(v)}
                options={(["swing", "timing"] as const).map((m) => ({
                  value: m,
                  label: t(`lobby.mode.${m}`),
                }))}
              />
              <Chips
                label={t("setup.bestOf")}
                value={bestOf}
                onChange={(v) => setBestOf(v)}
                options={([1, 3, 5] as const).map((n) => ({
                  value: n,
                  label: t("setup.bestOfN", { n }),
                }))}
              />
              <button
                type="button"
                class="btn btn--primary btn--block"
                onClick={create}
                data-testid="create-room"
              >
                {t("lobby.create")}
              </button>
            </section>
            <p class="muted" style={{ textAlign: "center" }}>
              {t("lobby.or")}
            </p>
            <form
              class="card stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (isRoomCode(normalizedCode)) connect(normalizedCode, false);
                else setError("not-found");
              }}
            >
              <label class="label" for="room-code">
                {t("lobby.codeLabel")}
              </label>
              <input
                id="room-code"
                class="input"
                value={normalizedCode}
                placeholder={t("lobby.codePlaceholder")}
                autoComplete="off"
                autoCapitalize="characters"
                inputMode="text"
                data-testid="room-code-input"
                onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)}
              />
              <button type="submit" class="btn btn--block" data-testid="join-room">
                {t("lobby.join")}
              </button>
            </form>
          </>
        )}

        {phase === "connecting" && <p>{t("lobby.connecting")}</p>}

        {phase === "waiting" && (
          <section class="card stack">
            <p class="label">{t("lobby.codeLabel")}</p>
            <div class="code" data-testid="room-code">
              {code}
            </div>
            <div class="row">
              <button type="button" class="btn btn--primary spacer" onClick={share}>
                {t("lobby.share")}
              </button>
            </div>
            <p class="label">{t("lobby.players")}</p>
            <ul class="stack" style={{ margin: 0, paddingLeft: "1.2em" }}>
              {players.map((p, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: dua kursi tetap, urutan tidak berubah
                <li key={i}>{p ?? "…"}</li>
              ))}
            </ul>
            <p class="muted">{t("lobby.waiting")}</p>
            <p class="muted">
              {t("lobby.mode")}: {t(`lobby.mode.${mode}`)} · {t("setup.bestOfN", { n: bestOf })}
            </p>
          </section>
        )}
        {toast && <div class="toast">{toast}</div>}
      </div>
    </main>
  );
};

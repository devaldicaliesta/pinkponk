import { isRoomCode, QUEUE_BEST_OF, type RoomConfig, type ServerControl } from "@pinkponk/protocol";
import type { BestOf, PlayMode, Side } from "@pinkponk/sim";
import { useEffect, useRef, useState } from "preact/hooks";
import { useT } from "../../i18n";
import { createRoom, NetClient, type NetError } from "../../net/client";
import { findOpponent } from "../../net/queue";
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
  initialGamble: boolean;
  onStart(s: OnlineStart): void;
  onBack(): void;
}

type Phase = "choose" | "connecting" | "searching" | "waiting";
type LobbyError = NetError | "no-opponent";

// Lawan dari antrean yang tidak kunjung masuk room (misalnya menutup tab) tidak ditunggu lama.
const QUICK_JOIN_TIMEOUT_MS = 15_000;

export const roomLink = (code: string) => `${location.origin}/r/${code}`;

export const Lobby = ({ initialCode, initialMode, initialGamble, onStart, onBack }: Props) => {
  const t = useT();
  const [mode, setMode] = useState<PlayMode>(initialMode);
  const [bestOf, setBestOf] = useState<BestOf>(3);
  const [gamble, setGamble] = useState(initialGamble);
  const [code, setCode] = useState(initialCode ?? "");
  const [phase, setPhase] = useState<Phase>("choose");
  const [error, setError] = useState<LobbyError | null>(null);
  const [searchStart, setSearchStart] = useState(0);
  const [now, setNow] = useState(Date.now());
  const cancelSearch = useRef<(() => void) | null>(null);
  const quick = useRef(false);
  const [players, setPlayers] = useState<[string | null, string | null]>([null, null]);
  const [toast, setToast] = useState<string | null>(null);
  const client = useRef<NetClient | null>(null);
  const started = useRef(false);
  const you = useRef<Side>(0);

  useEffect(
    () => () => {
      cancelSearch.current?.();
      if (!started.current) client.current?.close();
    },
    [],
  );

  useEffect(() => {
    if (phase !== "searching" && !(phase === "waiting" && quick.current)) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "waiting" || !quick.current) return;
    const id = setTimeout(() => {
      leave();
      setError("no-opponent");
    }, QUICK_JOIN_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [phase, players[1]]);

  const connect = (roomCode: string, create: boolean, quickBestOf?: BestOf) => {
    setError(null);
    setPhase("connecting");
    const config: RoomConfig = { mode, bestOf: quickBestOf ?? bestOf, gamble };
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
          setGamble(m.config.gamble);
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

  const quickMatch = () => {
    setError(null);
    setPhase("searching");
    setSearchStart(Date.now());
    setNow(Date.now());
    const q = findOpponent(mode, gamble, () => {});
    cancelSearch.current = q.cancel;
    void q.result.then((r) => {
      cancelSearch.current = null;
      if (r.kind === "matched") {
        quick.current = true;
        // Kedua pemain mengirim "create": siapa pun yang tiba lebih dulu membuat room.
        connect(r.code, true, QUEUE_BEST_OF);
        return;
      }
      setPhase("choose");
      if (r.kind === "timeout") setError("no-opponent");
      else setError(r.code);
    });
  };

  const stopSearch = () => {
    cancelSearch.current?.();
    cancelSearch.current = null;
    setPhase("choose");
    setError(null);
  };

  const leave = () => {
    quick.current = false;
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
            {error === "no-opponent" ? t("lobby.noOpponent") : t(`lobby.err.${error}`)}
          </p>
        )}
        {error === "outdated" && (
          <button type="button" class="btn btn--block" onClick={() => location.reload()}>
            {t("lobby.reload")}
          </button>
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
                label={t("lobby.gamble")}
                value={gamble ? "on" : "off"}
                onChange={(v) => setGamble(v === "on")}
                options={(["off", "on"] as const).map((g) => ({
                  value: g,
                  label: t(`lobby.gamble.${g}`),
                }))}
              />
              <button
                type="button"
                class="btn btn--primary btn--block"
                onClick={quickMatch}
                data-testid="quick-match"
              >
                {t("lobby.quick")}
              </button>
              <p class="muted">{t("lobby.quickHint")}</p>
            </section>
            <section class="card stack">
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
                class="btn btn--block"
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

        {phase === "searching" && (
          <section class="card stack searching" data-testid="searching">
            <div class="searching__pulse" aria-hidden="true" />
            <p>{t("lobby.searching", { s: Math.floor((now - searchStart) / 1000) })}</p>
            <button type="button" class="btn btn--block" onClick={stopSearch}>
              {t("lobby.cancel")}
            </button>
          </section>
        )}

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
              {gamble ? ` · ${t("lobby.gamble.on")}` : ""}
            </p>
          </section>
        )}
        {toast && <div class="toast">{toast}</div>}
      </div>
    </main>
  );
};

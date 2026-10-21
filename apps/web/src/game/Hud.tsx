import { EMOJIS } from "@pinkponk/protocol";
import type { FaultReason, Side, TimingGrade } from "@pinkponk/sim";
import { useT } from "../i18n";
import type { RouletteInfo } from "./feedback";
import { GambleBar, OpponentGamble, Roulette } from "./GambleHud";
import type { MatchView, NetStatus, SessionKind } from "./session";

export interface HudState {
  view: MatchView;
  countdown: number | null;
  toast: { key: number; reason: FaultReason | "let" } | null;
  judge: { key: number; grade: TimingGrade } | null;
  fever: boolean;
  badge: "deuce" | "gamePoint" | "matchPoint" | null;
  net: NetStatus | null;
  serveHint: "tap" | "key" | "p2" | "wait" | null;
  emoji: { key: number; player: Side; e: number } | null;
  roulette: RouletteInfo | null;
  shield: { key: number; player: Side } | null;
}

interface Props {
  state: HudState;
  kind: SessionKind;
  you: Side | null;
  names: [string, string];
  bestOf: number;
  canPause: boolean;
  onPause(): void;
  onCamera(): void;
  onEmoji?: (e: number) => void;
  gamble: boolean;
  reducedMotion: boolean;
  onAbility(): void;
}

const ScoreCard = ({
  name,
  points,
  games,
  need,
  serving,
  you,
}: {
  name: string;
  points: number;
  games: number;
  need: number;
  serving: boolean;
  you: boolean;
}) => (
  <div class={`glass score${you ? " score--you" : ""}`}>
    <div>
      <div class="score__name">{name}</div>
      <div class="score__games" aria-hidden="true">
        {Array.from({ length: need }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: daftar statis, urutan tidak pernah berubah
          <span key={i} class={`score__game${i < games ? " score__game--won" : ""}`} />
        ))}
      </div>
    </div>
    <span class={`score__serve${serving ? "" : " score__serve--off"}`} aria-hidden="true" />
    {/* key berganti tiap poin agar animasi "bump" diputar ulang. */}
    <span key={points} class="score__points" data-testid={you ? "score-you" : "score-opponent"}>
      {points}
    </span>
  </div>
);

const pingColor = (ms: number | null) =>
  ms === null
    ? "var(--text-muted)"
    : ms < 80
      ? "var(--lime)"
      : ms < 150
        ? "#ffc53d"
        : "var(--danger)";

export const Hud = ({
  state,
  kind,
  you,
  names,
  bestOf,
  canPause,
  onPause,
  onCamera,
  onEmoji,
  gamble,
  reducedMotion,
  onAbility,
}: Props) => {
  const t = useT();
  const v = state.view;
  const need = Math.ceil(bestOf / 2);
  // Pemain di perangkat ini selalu tampil di kiri.
  const left: Side = you ?? 0;
  const right: Side = left === 0 ? 1 : 0;
  const ping = state.net?.pingMs ?? null;
  const showServe = v.phase === "serve" || v.phase === "toss";

  return (
    <div class="hud" aria-live="polite">
      <div class="hud__top">
        <ScoreCard
          name={names[left]}
          points={v.points[left]}
          games={v.games[left]}
          need={need}
          serving={showServe && v.server === left}
          you={you !== null}
        />
        <div class="hud__mid">
          {state.net && (
            <div
              class="glass ping"
              title={ping === null ? "" : t("game.ping", { ms: Math.round(ping) })}
            >
              <span class="ping__dot" style={{ background: pingColor(ping) }} />
              {ping === null ? "…" : `${Math.round(ping)} ms`}
            </div>
          )}
          <div class="hud__btns">
            <button
              type="button"
              class="btn btn--icon glass"
              aria-label={t("game.camera")}
              onClick={onCamera}
            >
              <CameraIcon />
            </button>
            {canPause && (
              <button
                type="button"
                class="btn btn--icon glass"
                aria-label={t("game.pause")}
                onClick={onPause}
              >
                <PauseIcon />
              </button>
            )}
          </div>
        </div>
        <div class="hud__right">
          <ScoreCard
            name={names[right]}
            points={v.points[right]}
            games={v.games[right]}
            need={need}
            serving={showServe && v.server === right}
            you={false}
          />
          {gamble && <OpponentGamble g={v.gamble[right]} />}
        </div>
      </div>

      <div class="hud__center">
        {state.countdown !== null && (
          <div class="hud__countdown" key={state.countdown}>
            {state.countdown === 0 ? t("game.go") : state.countdown}
          </div>
        )}
        {state.badge && <div class="hud__badge">{t(`game.${state.badge}`)}</div>}
        {state.fever && <div class="fever">{t("game.fever")}</div>}
        {state.toast && (
          <div key={state.toast.key} class="hud__toast" data-testid="point-reason">
            {t(`game.reason.${state.toast.reason}`)}
          </div>
        )}
        {state.roulette && (
          <Roulette
            key={state.roulette.key}
            info={state.roulette}
            you={you}
            reduced={reducedMotion}
          />
        )}
        {state.shield && (
          <div key={state.shield.key} class="hud__toast hud__toast--shield">
            {t("gamble.shield")}
          </div>
        )}
        {state.emoji && (
          <div key={state.emoji.key} class="emoji-float" aria-hidden="true">
            {EMOJIS[state.emoji.e]}
          </div>
        )}
      </div>

      <div class="hud__bottom">
        {/* Penilaian timing di bawah agar tidak menutupi bola di tengah layar. */}
        {state.judge && (
          <div
            key={state.judge.key}
            class={`judge judge--${state.judge.grade}`}
            data-testid="judge"
          >
            {state.judge.grade.toUpperCase()}
          </div>
        )}
        {state.serveHint && (
          <div class="glass hud__hint" data-testid="serve-hint">
            {state.serveHint === "tap"
              ? t("game.serveTap")
              : state.serveHint === "key"
                ? t("game.serveKey")
                : state.serveHint === "p2"
                  ? t("game.serveP2")
                  : t("game.waitServe")}
          </div>
        )}
        {gamble && you !== null && <GambleBar g={v.gamble[you]} onPress={onAbility} />}
        {kind === "online" && onEmoji && (
          <div class="emoji-bar">
            {EMOJIS.map((e, i) => (
              <button
                key={e}
                type="button"
                class="btn btn--icon glass"
                aria-label={e}
                onClick={() => onEmoji(i)}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CameraIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    aria-hidden="true"
  >
    <path d="M3 8h3l2-3h8l2 3h3v11H3z" stroke-linejoin="round" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

const PauseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

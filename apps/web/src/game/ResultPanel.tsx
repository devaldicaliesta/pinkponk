import { useState } from "preact/hooks";
import { useT } from "../i18n";
import { shareText } from "../share";
import type { MatchStats } from "./feedback";
import type { MatchView, NetStatus, Session } from "./session";

interface Props {
  session: Session;
  view: MatchView;
  net: NetStatus | null;
  stats: MatchStats;
  onRematch(): void;
  onMenu(): void;
}

export const ResultPanel = ({ session, view, net, stats, onRematch, onMenu }: Props) => {
  const t = useT();
  const [toast, setToast] = useState<string | null>(null);
  const winner = view.winner ?? 0;
  const you = session.you;
  const title =
    you === null
      ? t("game.playerWins", { name: session.names[winner] })
      : winner === you
        ? t("game.youWin")
        : t("game.youLose");
  const left = you ?? 0;
  const right = left === 0 ? 1 : 0;
  const score = `${view.games[left]} – ${view.games[right]}`;
  const waiting = net !== null && you !== null && net.rematch[you];
  const opponentWants = net !== null && you !== null && net.rematch[you === 0 ? 1 : 0];

  const share = async () => {
    const text = `PinkPonk: ${session.names[left]} ${score} ${session.names[right]}`;
    const result = await shareText(text, location.origin);
    if (result === "copied") setToast(t("lobby.copied"));
  };

  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div class="glass overlay__panel" data-testid="result">
        <h2 class="display result__title">{title}</h2>
        <div class="result__score">{score}</div>
        <p class="muted">
          {t("game.longestRally", { n: stats.longestRally })}
          {session.mode === "timing" && (
            <>
              <br />
              {t("game.perfects", { n: stats.perfects })}
            </>
          )}
        </p>
        {net?.opponentLeft ? (
          <p>{t("game.opponentLeft")}</p>
        ) : (
          <button
            type="button"
            class="btn btn--primary btn--block"
            onClick={onRematch}
            disabled={waiting}
            data-testid="rematch"
          >
            {waiting ? t("game.waitRematch") : t("game.rematch")}
          </button>
        )}
        {opponentWants && !waiting && <p class="muted">{t("game.opponentRematch")}</p>}
        <div class="row">
          <button type="button" class="btn spacer" onClick={onMenu} data-testid="menu">
            {t("game.menu")}
          </button>
          <button type="button" class="btn spacer" onClick={share}>
            {t("game.share")}
          </button>
        </div>
        {toast && <div class="toast">{toast}</div>}
      </div>
    </div>
  );
};

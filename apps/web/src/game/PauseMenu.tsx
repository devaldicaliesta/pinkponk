import { useEffect, useRef, useState } from "preact/hooks";
import { useT } from "../i18n";
import type { Pov } from "../state/settings";

interface OnlinePause {
  by: string;
  resumeBy: number;
  pausesLeft: number;
}

interface Props {
  pov: Pov;
  online: OnlinePause | null;
  onResume(): void;
  onQuit(): void;
  onCamera(): void;
}

export const PauseMenu = ({ pov, online, onResume, onQuit, onCamera }: Props) => {
  const t = useT();
  const first = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(Date.now());
  // Fokus ke tombol pertama agar dialog bisa langsung dioperasikan dengan keyboard.
  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    if (!online) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [online]);
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label={t("game.pause")}>
      <div class="glass overlay__panel" data-testid="pause-menu">
        <h2 class="display result__title">{t("game.pause")}</h2>
        {online && (
          <p class="muted">
            {t("game.pausedBy", {
              name: online.by,
              s: Math.max(0, Math.ceil((online.resumeBy - now) / 1000)),
            })}
            <br />
            {t("game.pausesLeft", { n: online.pausesLeft })}
          </p>
        )}
        <button type="button" class="btn btn--primary btn--block" onClick={onResume} ref={first}>
          {t("game.resume")}
        </button>
        <button type="button" class="btn btn--block" onClick={onCamera}>
          {t("game.camera")}: {t(`pov.${pov}`)}
        </button>
        <button type="button" class="btn btn--block" onClick={onQuit}>
          {t("game.quit")}
        </button>
      </div>
    </div>
  );
};

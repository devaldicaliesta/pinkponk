import { useEffect, useRef } from "preact/hooks";
import { useT } from "../i18n";
import type { Pov } from "../state/settings";

interface Props {
  pov: Pov;
  onResume(): void;
  onQuit(): void;
  onCamera(): void;
}

export const PauseMenu = ({ pov, onResume, onQuit, onCamera }: Props) => {
  const t = useT();
  const first = useRef<HTMLButtonElement>(null);
  // Fokus ke tombol pertama agar dialog bisa langsung dioperasikan dengan keyboard.
  useEffect(() => first.current?.focus(), []);
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label={t("game.pause")}>
      <div class="glass overlay__panel">
        <h2 class="display result__title">{t("game.pause")}</h2>
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

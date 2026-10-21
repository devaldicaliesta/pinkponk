import { useEffect, useState } from "preact/hooks";
import { useT } from "../../i18n";
import { useSettings } from "../../state/settings";
import { Logo } from "../components/Logo";
import { ModeIcon, type ModeIconName } from "../components/ModeIcon";

export type MenuMode = "ai" | "local" | "online" | "timing";

interface Props {
  onMode(m: MenuMode): void;
  onSettings(): void;
  onHowTo(): void;
  onNickname(): void;
}

const useOnline = () => {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
};

const MODES: MenuMode[] = ["ai", "timing", "online", "local"];

export const Title = ({ onMode, onSettings, onHowTo, onNickname }: Props) => {
  const t = useT();
  const s = useSettings();
  const online = useOnline();
  return (
    <main class="screen">
      <div class="screen__inner">
        <div class="hero">
          <svg class="scribble" viewBox="0 0 120 60" aria-hidden="true">
            <path
              d="M6 40c30-30 70-36 106-18M20 52c28-18 60-22 92-8"
              fill="none"
              stroke="var(--lime)"
              stroke-width="5"
              stroke-linecap="round"
            />
          </svg>
          <h1 class="visually-hidden">PinkPonk</h1>
          <Logo height={88} />
          <p class="hero__tagline">{t("app.tagline")}</p>
        </div>
        {s.nickname && (
          <div class="row">
            <span>{t("app.hello", { name: s.nickname })}</span>
            <button type="button" class="btn" onClick={onNickname}>
              {t("app.changeNick")}
            </button>
          </div>
        )}
        <nav class="stack" aria-label={t("app.play")}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              class="mode-card"
              onClick={() => onMode(m)}
              disabled={m === "online" && !online}
              data-testid={`mode-${m}`}
            >
              <ModeIcon name={m as ModeIconName} />
              <span>
                <span class="display mode-card__name">{t(`mode.${m}`)}</span>
                <span class="mode-card__desc">{t(`mode.${m}.desc`)}</span>
              </span>
            </button>
          ))}
        </nav>
        {!online && <p class="muted">{t("app.offline")}</p>}
        <div class="row">
          <button type="button" class="btn spacer" onClick={onHowTo}>
            {t("app.howto")}
          </button>
          <button type="button" class="btn spacer" onClick={onSettings} data-testid="open-settings">
            {t("app.settings")}
          </button>
        </div>
      </div>
    </main>
  );
};

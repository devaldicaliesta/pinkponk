import { useT } from "../../i18n";
import { updateSettings } from "../../state/settings";
import { TopBar } from "../components/TopBar";

export const HowTo = ({ onDone }: { onDone(): void }) => {
  const t = useT();
  const done = () => {
    updateSettings({ tutorialDone: true });
    onDone();
  };
  return (
    <main class="screen">
      <div class="screen__inner">
        <TopBar onBack={done} />
        <h1 class="display screen-title">{t("tutorial.title")}</h1>
        <section class="card stack">
          <h2 class="display">{t("mode.ai")}</h2>
          <p>{t("tutorial.swing.1")}</p>
          <p>{t("tutorial.swing.2")}</p>
          <p class="muted">{t("tutorial.swing.3")}</p>
        </section>
        <section class="card stack">
          <h2 class="display">{t("mode.timing")}</h2>
          <p>{t("tutorial.timing.1")}</p>
          <p>{t("tutorial.timing.2")}</p>
        </section>
        <p>{t("tutorial.rules")}</p>
        <p class="muted">{t("game.hintLocal")}</p>
        <button
          type="button"
          class="btn btn--primary btn--block"
          onClick={done}
          data-testid="howto-done"
        >
          {t("tutorial.done")}
        </button>
      </div>
    </main>
  );
};

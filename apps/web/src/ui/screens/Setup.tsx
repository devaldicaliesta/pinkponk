import type { BestOf, Difficulty } from "@pinkponk/sim";
import { useState } from "preact/hooks";
import { useT } from "../../i18n";
import { getSettings, type Pov, updateSettings } from "../../state/settings";
import { Chips } from "../components/Chips";
import { TopBar } from "../components/TopBar";

export interface SetupResult {
  difficulty: Difficulty;
  bestOf: BestOf;
}

interface Props {
  mode: "ai" | "timing" | "local";
  onStart(r: SetupResult): void;
  onBack(): void;
}

export const Setup = ({ mode, onStart, onBack }: Props) => {
  const t = useT();
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [bestOf, setBestOf] = useState<BestOf>(mode === "timing" ? 1 : 3);
  const saved = getSettings().pov;
  const [pov, setPov] = useState<Pov>(saved ?? (mode === "local" ? "tv" : "classic"));
  const povs: Pov[] =
    mode === "local" ? ["classic", "tv", "iso"] : ["classic", "first", "tv", "iso"];

  return (
    <main class="screen">
      <div class="screen__inner">
        <TopBar onBack={onBack} />
        <h1 class="display screen-title">{t(`mode.${mode}`)}</h1>
        {mode !== "local" && (
          <Chips
            label={t("setup.difficulty")}
            value={difficulty}
            onChange={(v) => setDifficulty(v)}
            options={(["easy", "medium", "hard"] as const).map((d) => ({
              value: d,
              label: t(`setup.${d}`),
            }))}
          />
        )}
        <Chips
          label={t("setup.bestOf")}
          value={bestOf}
          onChange={(v) => setBestOf(v)}
          options={([1, 3, 5] as const).map((n) => ({
            value: n,
            label: t("setup.bestOfN", { n }),
          }))}
        />
        <Chips
          label={t("setup.pov")}
          value={povs.includes(pov) ? pov : "classic"}
          onChange={(v) => setPov(v)}
          options={povs.map((p) => ({ value: p, label: t(`pov.${p}`) }))}
        />
        <p class="muted">
          {mode === "local"
            ? t("game.hintLocal")
            : mode === "timing"
              ? t("game.hintTiming")
              : t("game.hintSwing")}
        </p>
        <button
          type="button"
          class="btn btn--primary btn--block"
          data-testid="start"
          onClick={() => {
            updateSettings({ pov });
            onStart({ difficulty, bestOf });
          }}
        >
          {t("setup.start")}
        </button>
      </div>
    </main>
  );
};

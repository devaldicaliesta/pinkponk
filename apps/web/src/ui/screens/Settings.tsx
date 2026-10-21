import { useEffect, useRef, useState } from "preact/hooks";
import {
  ARMORS,
  BATS,
  CANVAS_H,
  CANVAS_W,
  drawCharacter,
  FRAMES,
  lookFromIndices,
  VISORS,
} from "../../game/character";
import { useT } from "../../i18n";
import {
  type CharacterLook,
  type Settings as S,
  updateSettings,
  useSettings,
} from "../../state/settings";
import { Chips } from "../components/Chips";
import { Switch } from "../components/Switch";
import { TopBar } from "../components/TopBar";
import { Calibration } from "./Calibration";

const Preview = ({ look, label }: { look: CharacterLook; label: string }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawCharacter(ctx, lookFromIndices(look), "ready", "front");
  }, [look]);
  return (
    <div class="preview">
      <canvas ref={ref} width={CANVAS_W} height={CANVAS_H} role="img" aria-label={label} />
    </div>
  );
};

const Swatches = ({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: number;
  onChange(i: number): void;
}) => (
  <fieldset class="stack fieldset">
    <legend class="label">{label}</legend>
    <div class="swatches">
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          class="swatch"
          style={{ background: c }}
          aria-label={`${label} ${i + 1}`}
          aria-pressed={i === value}
          onClick={() => onChange(i)}
        />
      ))}
    </div>
  </fieldset>
);

export const Settings = ({ onBack, onNickname }: { onBack(): void; onNickname(): void }) => {
  const t = useT();
  const s = useSettings();
  const [calibrating, setCalibrating] = useState(false);
  const set = (patch: Partial<S>) => updateSettings(patch);
  const setLook = (patch: Partial<CharacterLook>) =>
    set({ character: { ...s.character, ...patch } });
  const accuracy = s.stats.timingHits
    ? Math.round((s.stats.perfects / s.stats.timingHits) * 100)
    : 0;

  if (calibrating) return <Calibration onClose={() => setCalibrating(false)} />;

  return (
    <main class="screen">
      <div class="screen__inner">
        <TopBar onBack={onBack} />
        <h1 class="display screen-title">{t("settings.title")}</h1>

        <section class="card stack">
          <Chips
            label={t("settings.theme")}
            value={s.theme}
            onChange={(theme) => set({ theme })}
            options={(["system", "dark", "light"] as const).map((v) => ({
              value: v,
              label: t(`settings.theme.${v}`),
            }))}
          />
          <Chips
            label={t("settings.lang")}
            value={s.lang}
            onChange={(lang) => set({ lang })}
            options={[
              { value: "id", label: "Bahasa Indonesia" },
              { value: "en", label: "English" },
            ]}
          />
        </section>

        <section class="card stack">
          <Switch
            label={t("settings.sound")}
            checked={s.sound}
            onChange={(sound) => set({ sound })}
          />
          <Switch
            label={t("settings.haptics")}
            checked={s.haptics}
            onChange={(haptics) => set({ haptics })}
          />
          <Switch
            label={t("settings.colorblind")}
            checked={s.colorblind}
            onChange={(colorblind) => set({ colorblind })}
          />
          <Chips
            label={t("settings.graphics")}
            value={s.graphics}
            onChange={(graphics) => set({ graphics })}
            options={(["auto", "high", "low"] as const).map((v) => ({
              value: v,
              label: t(`settings.graphics.${v}`),
            }))}
          />
          <Chips
            label={t("settings.motion")}
            value={s.motion}
            onChange={(motion) => set({ motion })}
            options={(["system", "reduced", "full"] as const).map((v) => ({
              value: v,
              label: t(`settings.motion.${v}`),
            }))}
          />
        </section>

        <section class="card stack">
          <p class="label">{t("settings.character")}</p>
          <Preview look={s.character} label={t("settings.character")} />
          <Swatches
            label={t("settings.frame")}
            colors={FRAMES}
            value={s.character.frame}
            onChange={(frame) => setLook({ frame })}
          />
          <Swatches
            label={t("settings.armor")}
            colors={ARMORS}
            value={s.character.armor}
            onChange={(armor) => setLook({ armor })}
          />
          <Swatches
            label={t("settings.visor")}
            colors={VISORS}
            value={s.character.visor}
            onChange={(visor) => setLook({ visor })}
          />
          <Swatches
            label={t("settings.bat")}
            colors={BATS}
            value={s.character.bat}
            onChange={(bat) => setLook({ bat })}
          />
        </section>

        <section class="card stack">
          <p class="label">{t("settings.calibration")}</p>
          <div class="row">
            <span>{t("settings.calibrationValue", { ms: Math.round(s.calibrationMs) })}</span>
            <div class="spacer" />
            <button type="button" class="btn" onClick={() => setCalibrating(true)}>
              {t("settings.calibrate")}
            </button>
          </div>
        </section>

        <section class="card stack">
          <p class="label">{t("settings.stats")}</p>
          <p>{t("settings.stats.record", { w: s.stats.wins, l: s.stats.losses })}</p>
          <p>{t("settings.stats.rally", { n: s.stats.longestRally })}</p>
          <p>{t("settings.stats.perfect", { p: accuracy })}</p>
          <button type="button" class="btn" onClick={onNickname}>
            {t("app.changeNick")}
          </button>
        </section>

        <p class="muted">{t("settings.privacy")}</p>
      </div>
    </main>
  );
};

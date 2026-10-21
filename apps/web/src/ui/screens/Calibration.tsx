import { useEffect, useRef, useState } from "preact/hooks";
import { play, unlockAudio } from "../../game/audio";
import { useT } from "../../i18n";
import { updateSettings } from "../../state/settings";
import { TopBar } from "../components/TopBar";

const BEAT_MS = 600;
const LEAD_BEATS = 2;
const BEATS = 8;

/** Rata-rata selisih tap terhadap ketukan terdekat; positif = pemain cenderung terlambat. */
export const calibrationOffset = (beats: number[], taps: number[]): number | null => {
  const diffs: number[] = [];
  for (const tap of taps) {
    let best: number | null = null;
    for (const b of beats) if (best === null || Math.abs(tap - b) < Math.abs(tap - best)) best = b;
    // Tap tepat di tengah dua ketukan ambigu, jadi diabaikan.
    if (best !== null && Math.abs(tap - best) < BEAT_MS / 2) diffs.push(tap - best);
  }
  if (diffs.length < 4) return null;
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return Math.max(-150, Math.min(150, Math.round(mean)));
};

export const Calibration = ({ onClose }: { onClose(): void }) => {
  const t = useT();
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [on, setOn] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const beats = useRef<number[]>([]);
  const taps = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const start = () => {
    unlockAudio();
    beats.current = [];
    taps.current = [];
    setState("running");
    const t0 = performance.now() + 400;
    let i = 0;
    const tick = () => {
      const when = t0 + i * BEAT_MS;
      if (i >= LEAD_BEATS) beats.current.push(when);
      play("beep");
      setOn(true);
      setTimeout(() => setOn(false), 120);
      i += 1;
      if (i < LEAD_BEATS + BEATS) {
        timer.current = setTimeout(tick, t0 + i * BEAT_MS - performance.now());
      } else {
        timer.current = setTimeout(() => {
          setResult(calibrationOffset(beats.current, taps.current));
          setState("done");
        }, BEAT_MS);
      }
    };
    timer.current = setTimeout(tick, 400);
  };

  const onTap = (e: PointerEvent | KeyboardEvent) => {
    if (state === "running") taps.current.push(e.timeStamp || performance.now());
  };

  return (
    <main class="screen" onPointerDown={onTap} onKeyDown={onTap}>
      <div class="screen__inner">
        <TopBar onBack={onClose} />
        <h1 class="display screen-title">{t("calib.title")}</h1>
        <p>{t("calib.body")}</p>
        <div class={`beat${on ? " beat--on" : ""}`} aria-hidden="true" />
        {state === "idle" && (
          <button type="button" class="btn btn--primary btn--block" onClick={start}>
            {t("calib.start")}
          </button>
        )}
        {state === "running" && (
          <p class="display" style={{ fontSize: "40px", textAlign: "center" }}>
            {t("calib.tap")}
          </p>
        )}
        {state === "done" && (
          <div class="stack">
            {result !== null && <p>{t("calib.done", { ms: result })}</p>}
            <div class="row">
              <button type="button" class="btn spacer" onClick={start}>
                {t("calib.retry")}
              </button>
              {result !== null && (
                <button
                  type="button"
                  class="btn btn--primary spacer"
                  onClick={() => {
                    updateSettings({ calibrationMs: result });
                    onClose();
                  }}
                >
                  {t("calib.save")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

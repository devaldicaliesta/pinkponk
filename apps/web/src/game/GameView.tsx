import { AiController, type Side } from "@pinkponk/sim";
import { useEffect, useRef, useState } from "preact/hooks";
import { sendEvent } from "../analytics";
import { useT } from "../i18n";
import { getSettings, type Pov, prefersReducedMotion, updateSettings } from "../state/settings";
import { play, setSoundEnabled, unlockAudio } from "./audio";
import { lookFromIndices, opponentLook } from "./character";
import { emptyStats, Feedback, type MatchStats } from "./feedback";
import { Hud, type HudState } from "./Hud";
import { badgeFor, countdownFor, serveHintFor } from "./hud-logic";
import { LocalSession } from "./local-session";
import { OnlineSession } from "./online-session";
import { PauseMenu } from "./PauseMenu";
import { ResultPanel } from "./ResultPanel";
import { GameRenderer, type RingInfo } from "./renderer";
import { readThemeColors } from "./scene";
import type { MatchView, Session } from "./session";

interface Props {
  session: Session;
  onExit(): void;
}

const RING_LEAD_MS = 650;
const POVS: Pov[] = ["classic", "first", "tv"];

const defaultPov = (session: Session): Pov => {
  const saved = getSettings().pov;
  if (session.kind === "local") return saved === "first" || !saved ? "tv" : saved;
  return saved ?? (window.innerWidth < window.innerHeight ? "classic" : "tv");
};

const ringFor = (session: Session): RingInfo | null => {
  if (session.mode !== "timing" || session.you === null) return null;
  const c = session.crossing(session.you);
  if (!c) return null;
  const dt = c.atMs - session.viewMs();
  if (dt > RING_LEAD_MS || dt < -120) return null;
  return { x: c.x, y: c.y, z: c.z, progress: Math.max(0, dt) / RING_LEAD_MS };
};

const initialHud = (session: Session): HudState => ({
  view: session.view(),
  countdown: null,
  toast: null,
  judge: null,
  fever: false,
  badge: null,
  net: session.net(),
  serveHint: null,
  emoji: null,
});

const snapshotHud = (s: HudState): HudState => ({
  ...s,
  view: { ...s.view, points: [...s.view.points], games: [...s.view.games] },
  net: s.net ? { ...s.net, rematch: [...s.net.rematch] } : null,
});

const hudKey = (s: HudState): string =>
  [
    s.view.points.join(),
    s.view.games.join(),
    s.view.phase,
    s.view.server,
    s.countdown,
    s.toast?.key,
    s.judge?.key,
    s.fever,
    s.badge,
    s.serveHint,
    s.emoji?.key,
    s.net
      ? `${Math.round((s.net.pingMs ?? 0) / 10)}|${!!s.net.paused}|${s.net.opponentLeft}|${s.net.reconnecting}|${s.net.rematch.join()}`
      : "",
  ].join(";");

const recordStats = (session: Session, view: MatchView, st: MatchStats): void => {
  const s = getSettings();
  const counted = session.kind !== "local" && session.you !== null;
  const won = counted && view.winner === session.you;
  updateSettings({
    stats: {
      wins: s.stats.wins + (won ? 1 : 0),
      losses: s.stats.losses + (counted && !won ? 1 : 0),
      longestRally: Math.max(s.stats.longestRally, st.longestRally),
      perfects: s.stats.perfects + st.perfects,
      timingHits: s.stats.timingHits + st.timingHits,
    },
  });
};

const GameView = ({ session, onExit }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const feedbackRef = useRef<Feedback | null>(null);
  const [hud, setHud] = useState<HudState>(() => initialHud(session));
  const [paused, setPaused] = useState(false);
  const [pov, setPov] = useState<Pov>(() => defaultPov(session));
  const [stats, setStats] = useState<MatchStats>(emptyStats);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const settings = getSettings();
    setSoundEnabled(settings.sound);
    const reduced = prefersReducedMotion(settings);
    const mine = lookFromIndices(settings.character);
    const viewer: Side = session.you ?? 0;
    const renderer = new GameRenderer({
      canvas,
      colors: readThemeColors(),
      looks: viewer === 0 ? [mine, opponentLook(mine)] : [opponentLook(mine), mine],
      viewer,
      pov,
      lowQuality: settings.graphics === "low",
      reducedMotion: reduced,
    });
    rendererRef.current = renderer;
    const feedback = new Feedback(renderer, session.you, session instanceof LocalSession, reduced);
    feedbackRef.current = feedback;
    if (session instanceof OnlineSession) {
      session.onEmoji = (player, e) => feedback.showEmoji(player, e, performance.now());
    }

    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener("resize", resize);
    const onTheme = () => renderer.applyTheme(readThemeColors());
    const media = matchMedia("(prefers-color-scheme: light)");
    media.addEventListener("change", onTheme);
    const themeObserver = new MutationObserver(onTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const coarse = matchMedia("(pointer: coarse)").matches;
    const hooks = { timeScale: 1 };
    let raf = 0;
    let lastKey = "";
    let lastCountdown: number | null = null;
    let fpsFrames = 0;
    let fpsStart = performance.now();
    let degraded = settings.graphics === "low";

    sendEvent("match_start", session.kind === "online" ? session.mode : session.kind);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (session instanceof LocalSession)
        session.timeScale = feedback.timeScale(now, hooks.timeScale);
      session.update(now);
      const view = session.view();
      for (const e of session.drainEvents()) feedback.handle(e, now, view);
      feedback.expire(now);
      const fever = session.you !== null ? view.fever[session.you] : view.fever[0] || view.fever[1];
      renderer.render(view, now, ringFor(session), fever);

      // Grafis otomatis: turunkan kualitas bila rata-rata < 50 FPS dalam 3 detik.
      fpsFrames++;
      if (now - fpsStart > 3000) {
        if (
          !degraded &&
          getSettings().graphics === "auto" &&
          (fpsFrames * 1000) / (now - fpsStart) < 50
        ) {
          degraded = true;
          renderer.setQuality(true);
        }
        fpsFrames = 0;
        fpsStart = now;
      }

      const countdown = countdownFor(view);
      if (countdown !== lastCountdown) {
        if (countdown !== null) play(countdown === 0 ? "go" : "beep");
        lastCountdown = countdown;
      }
      const next: HudState = {
        view,
        countdown,
        toast: feedback.toast,
        judge: feedback.judge,
        fever,
        badge: badgeFor(view, session.bestOf),
        net: session.net(),
        serveHint: serveHintFor(session.kind, session.you, view, coarse),
        emoji: feedback.emoji,
      };
      const key = hudKey(next);
      if (key !== lastKey) {
        lastKey = key;
        setHud(snapshotHud(next));
      }
      if (feedback.matchEnded) {
        feedback.matchEnded = false;
        setStats({ ...feedback.stats });
        recordStats(session, view, feedback.stats);
        sendEvent("match_end", session.kind === "online" ? session.mode : session.kind);
      }
    };

    if (__E2E__) {
      (window as unknown as { __pp: unknown }).__pp = {
        setTimeScale: (n: number) => {
          hooks.timeScale = n;
        },
        autoplay: () => {
          if (session instanceof LocalSession) session.autoplay = new AiController(0, "hard", 7);
        },
        crossing: () => (session.you === null ? null : session.crossing(session.you)),
        viewMs: () => session.viewMs(),
        tapNow: () => session.injectTap?.(performance.now()),
        view: () => session.view(),
      };
    }

    raf = requestAnimationFrame(frame);
    const onVisibility = () => {
      if (document.hidden && session.canPause()) {
        session.setPaused(true);
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      media.removeEventListener("change", onTheme);
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.dispose();
      rendererRef.current = null;
    };
    // Renderer dibuat sekali per sesi; perubahan POV diteruskan lewat efek terpisah.
  }, [session]);

  useEffect(() => {
    rendererRef.current?.setPov(pov);
  }, [pov]);

  const cyclePov = () => {
    const options = session.kind === "local" ? POVS.filter((p) => p !== "first") : POVS;
    const next = options[(options.indexOf(pov) + 1) % options.length] ?? "classic";
    setPov(next);
    updateSettings({ pov: next });
  };

  const pause = (on: boolean) => {
    session.setPaused(on);
    setPaused(on);
  };

  const rematch = () => {
    feedbackRef.current?.reset();
    setStats(emptyStats());
    session.rematch();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyV") cyclePov();
      if (e.code === "Escape" && session.canPause()) pause(!paused);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const over = hud.view.phase === "over" && hud.view.winner !== null;

  return (
    <div
      class="game"
      role="application"
      aria-label="PinkPonk"
      onPointerDown={unlockAudio}
      onKeyDown={unlockAudio}
    >
      <canvas ref={canvasRef} class="game__canvas" data-testid="game-canvas" />
      <Hud
        state={hud}
        kind={session.kind}
        you={session.you}
        names={session.names}
        bestOf={session.bestOf}
        canPause={session.canPause()}
        onPause={() => pause(true)}
        onCamera={cyclePov}
        onEmoji={session instanceof OnlineSession ? (e) => session.sendEmoji(e) : undefined}
      />
      {paused && !over && (
        <PauseMenu pov={pov} onResume={() => pause(false)} onQuit={onExit} onCamera={cyclePov} />
      )}
      {over && (
        <ResultPanel
          session={session}
          view={hud.view}
          net={hud.net}
          stats={stats}
          onRematch={rematch}
          onMenu={onExit}
        />
      )}
      {!over && hud.net?.paused && <NetOverlay resumeBy={hud.net.paused.resumeBy} />}
      {!over && !hud.net?.paused && hud.net?.reconnecting && <NetOverlay resumeBy={null} />}
    </div>
  );
};

const NetOverlay = ({ resumeBy }: { resumeBy: number | null }) => {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const text =
    resumeBy === null
      ? t("game.reconnecting")
      : t("game.paused", { s: Math.max(0, Math.ceil((resumeBy - now) / 1000)) });
  return (
    <div class="overlay">
      <div class="glass overlay__panel">
        <p>{text}</p>
      </div>
    </div>
  );
};

export default GameView;

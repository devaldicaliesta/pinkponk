import { useEffect, useState } from "preact/hooks";
import { useT } from "../../i18n";
import { fetchLeaderboard, type Ranked } from "../../net/leaderboard";
import { ACHIEVEMENTS, levelOf, useProgress } from "../../state/progress";
import { Chips } from "../components/Chips";
import { TopBar } from "../components/TopBar";

type Tab = "global" | "personal";

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ok"; top: Ranked[]; me: Ranked | null };

const RankRow = ({ r, you }: { r: Ranked; you: boolean }) => {
  const t = useT();
  return (
    <li class={`lb-row${you ? " lb-row--you" : ""}`}>
      <span class={`lb-row__rank${r.rank <= 3 ? ` lb-row__rank--${r.rank}` : ""}`}>{r.rank}</span>
      <span class="lb-row__name">{r.name}</span>
      <span class="lb-row__wl">{t("lb.wl", { w: r.wins, l: r.losses })}</span>
      <span class="lb-row__rating">{r.rating}</span>
    </li>
  );
};

const Global = () => {
  const t = useT();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const fetchNow = () => {
    setLoad({ state: "loading" });
    fetchLeaderboard()
      .then((d) => setLoad({ state: "ok", ...d }))
      .catch(() => setLoad({ state: "error" }));
  };
  useEffect(fetchNow, []);

  if (load.state === "loading") return <p class="muted">{t("lb.loading")}</p>;
  if (load.state === "error") {
    return (
      <div class="stack">
        <p class="field__error" role="alert">
          {t("lb.error")}
        </p>
        <button type="button" class="btn" onClick={fetchNow}>
          {t("lb.retry")}
        </button>
      </div>
    );
  }
  const { top, me } = load;
  const meInTop = me !== null && top.some((r) => r.rank === me.rank && r.name === me.name);
  return (
    <div class="stack">
      {top.length === 0 ? (
        <p class="muted">{t("lb.empty")}</p>
      ) : (
        <ol class="lb" data-testid="leaderboard-list">
          {top.map((r) => (
            <RankRow
              key={`${r.rank}-${r.name}`}
              r={r}
              you={me !== null && r.rank === me.rank && r.name === me.name}
            />
          ))}
        </ol>
      )}
      {me && !meInTop && (
        <ol class="lb">
          <RankRow r={me} you />
        </ol>
      )}
      {!me && <p class="muted">{t("lb.unranked")}</p>}
      <p class="muted small">{t("lb.note")}</p>
    </div>
  );
};

const Personal = () => {
  const t = useT();
  const p = useProgress();
  const lv = levelOf(p.xp);
  const rows: [string, number][] = [
    [t("stats.matches"), p.matches],
    [t("stats.wins"), p.wins],
    [t("stats.bestStreak"), p.bestStreak],
    [t("stats.bestRally"), p.bestRally],
    [t("stats.perfects"), p.perfects],
    [t("stats.abilities"), p.abilities],
    [t("stats.jackpots"), p.jackpots],
  ];
  return (
    <div class="stack">
      <div class="level level--big">
        <span class="level__n">{t("xp.level", { n: lv.level })}</span>
        <span class="level__bar" aria-hidden="true">
          <span style={{ width: `${Math.round((lv.into / lv.need) * 100)}%` }} />
        </span>
        <span class="level__xp">{t("xp.progress", { a: lv.into, b: lv.need })}</span>
      </div>
      <dl class="stats-grid">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p class="label">{t("ach.title")}</p>
      <ul class="ach">
        {ACHIEVEMENTS.map((a) => {
          const done = p.achievements.includes(a);
          return (
            <li key={a} class={`ach__item${done ? " ach__item--done" : ""}`}>
              <span class="ach__mark" aria-hidden="true">
                {done ? "★" : "☆"}
              </span>
              {t(`ach.${a}`)}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const Leaderboard = ({ onBack }: { onBack(): void }) => {
  const t = useT();
  const [tab, setTab] = useState<Tab>("global");
  return (
    <main class="screen">
      <div class="screen__inner">
        <TopBar onBack={onBack} />
        <h1 class="display screen-title">{t("lb.title")}</h1>
        <Chips
          label={t("lb.title")}
          value={tab}
          onChange={(v) => setTab(v)}
          options={(["global", "personal"] as const).map((v) => ({
            value: v,
            label: t(`lb.${v}`),
          }))}
        />
        <section class="card">{tab === "global" ? <Global /> : <Personal />}</section>
      </div>
    </main>
  );
};

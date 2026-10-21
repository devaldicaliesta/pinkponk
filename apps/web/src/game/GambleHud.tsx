import type { GambleView } from "@pinkponk/protocol";
import { ABILITIES, type Ability, type Side, STACK_MAX } from "@pinkponk/sim";
import { useEffect, useState } from "preact/hooks";
import { useT } from "../i18n";
import { ROULETTE_SPIN_MS, type RouletteInfo } from "./feedback";

const BAD: readonly Ability[] = ["jinx"];
const RARE: readonly Ability[] = ["jackpot"];

const tone = (a: Ability) => (BAD.includes(a) ? "bad" : RARE.includes(a) ? "rare" : "good");

const Pips = ({ g, small }: { g: GambleView; small?: boolean }) => (
  <span class={`pips${small ? " pips--small" : ""}`} aria-hidden="true">
    {Array.from({ length: STACK_MAX }, (_, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: jumlah tetap, urutan tidak berubah
      <span key={i} class={`pip${i < g.stack ? " pip--on" : ""}`} />
    ))}
  </span>
);

const ActiveChip = ({ g }: { g: GambleView }) => {
  const t = useT();
  if (!g.ability) return null;
  return (
    <span class={`ability-chip ability-chip--${tone(g.ability)}`}>
      {t(`ability.${g.ability}`)} · {t("gamble.points", { n: g.pointsLeft })}
    </span>
  );
};

/** Meter stack + tombol GAMBLE untuk pemain di perangkat ini. */
export const GambleBar = ({ g, onPress }: { g: GambleView; onPress(): void }) => {
  const t = useT();
  const ready = g.stack >= STACK_MAX && g.ability === null && !g.armed;
  return (
    <div class="gamble-bar glass" data-testid="gamble-bar">
      <div class="gamble-bar__meter">
        <span class="gamble-bar__label">{t("gamble.stack", { n: g.stack, max: STACK_MAX })}</span>
        <Pips g={g} />
        {g.armed && <span class="gamble-bar__armed">{t("gamble.armed")}</span>}
        <ActiveChip g={g} />
      </div>
      <button
        type="button"
        class={`btn gamble-btn${ready ? " gamble-btn--ready" : ""}`}
        disabled={!ready}
        onClick={onPress}
        data-testid="gamble-button"
        aria-label={t("gamble.button")}
      >
        <span>{t("gamble.button")}</span>
        <small>{t("gamble.buttonHint")}</small>
      </button>
    </div>
  );
};

/** Status Gamble lawan, ringkas di bawah kartu skornya. */
export const OpponentGamble = ({ g }: { g: GambleView }) => (
  <div class="opp-gamble">
    <Pips g={g} small />
    <ActiveChip g={g} />
  </div>
);

/** Roulette berputar sebentar lalu menampilkan kemampuan yang didapat. */
// Di Timing Smash bat bergerak sendiri, jadi efek jangkauan/kecepatan bat diganti lebar
// jendela timing; deskripsinya pun berbeda.
const TIMING_DESC = ["giant", "magnet", "freeze", "jinx", "jackpot"] as const;
type TimingDescAbility = (typeof TIMING_DESC)[number];
const hasTimingDesc = (a: Ability): a is TimingDescAbility =>
  (TIMING_DESC as readonly Ability[]).includes(a);

export const Roulette = ({
  info,
  you,
  reduced,
  timing,
}: {
  info: RouletteInfo;
  you: Side | null;
  reduced: boolean;
  timing: boolean;
}) => {
  const t = useT();
  const [spin, setSpin] = useState<{ name: Ability; landed: boolean }>({
    name: info.ability,
    landed: reduced,
  });
  useEffect(() => {
    if (reduced) {
      setSpin({ name: info.ability, landed: true });
      return;
    }
    let elapsed = 0;
    let delay = 45;
    let i = 0;
    let timer = 0;
    setSpin({ name: ABILITIES[0] ?? info.ability, landed: false });
    // Putaran melambat seperti roda sungguhan, lalu berhenti tepat di hasil server.
    const step = () => {
      elapsed += delay;
      if (elapsed >= ROULETTE_SPIN_MS) {
        setSpin({ name: info.ability, landed: true });
        return;
      }
      i = (i + 1) % ABILITIES.length;
      setSpin({ name: ABILITIES[i] ?? info.ability, landed: false });
      delay *= 1.18;
      timer = window.setTimeout(step, delay);
    };
    timer = window.setTimeout(step, delay);
    return () => clearTimeout(timer);
  }, [info.key]);

  const landed = spin.landed;
  const who = you === null || info.player === you ? t("gamble.you") : t("gamble.them");
  const ability = spin.name;
  return (
    <div
      class={`roulette roulette--${landed ? tone(info.ability) : "spin"}`}
      data-testid="roulette"
      aria-live="assertive"
    >
      <span class="roulette__who">{who}</span>
      <span class="roulette__name">{t(`ability.${ability}`)}</span>
      {landed && (
        <span class="roulette__desc">
          {timing && hasTimingDesc(info.ability)
            ? t(`ability.${info.ability}.descTiming`)
            : t(`ability.${info.ability}.desc`)}{" "}
          · {t("gamble.points", { n: info.points })}
        </span>
      )}
    </div>
  );
};

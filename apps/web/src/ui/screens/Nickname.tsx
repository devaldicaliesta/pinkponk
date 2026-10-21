import { NICK_MAX, validateNickname } from "@pinkponk/sim";
import { useEffect, useRef, useState } from "preact/hooks";
import { useT } from "../../i18n";
import { getSettings, updateSettings } from "../../state/settings";
import { TopBar } from "../components/TopBar";

export const Nickname = ({ onDone, onBack }: { onDone(): void; onBack?: () => void }) => {
  const t = useT();
  const [value, setValue] = useState(getSettings().nickname ?? "");
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const result = validateNickname(value);
  const error = touched && !result.ok ? t(`nick.err.${result.error}`) : null;

  const submit = (e: Event) => {
    e.preventDefault();
    setTouched(true);
    if (!result.ok) return;
    updateSettings({ nickname: result.value });
    onDone();
  };

  return (
    <main class="screen">
      <form class="screen__inner" onSubmit={submit} noValidate>
        <TopBar onBack={onBack} />
        <h1 class="display screen-title">{t("nick.title")}</h1>
        <div class="stack">
          <label class="label" for="nick">
            {t("nick.label")}
          </label>
          <input
            id="nick"
            class="input"
            value={value}
            maxLength={NICK_MAX + 4}
            autoComplete="nickname"
            ref={input}
            aria-invalid={error !== null}
            aria-describedby="nick-meta"
            data-testid="nick-input"
            onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)}
            onBlur={() => setTouched(true)}
          />
          <div class="field__meta" id="nick-meta">
            <span class={error ? "field__error" : "muted"} role={error ? "alert" : undefined}>
              {error ?? t("nick.hint")}
            </span>
            <span class="muted">
              {value.trim().length}/{NICK_MAX}
            </span>
          </div>
        </div>
        <button type="submit" class="btn btn--primary btn--block" data-testid="nick-save">
          {t("nick.save")}
        </button>
      </form>
    </main>
  );
};

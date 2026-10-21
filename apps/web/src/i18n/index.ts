import { getSettings, type Lang, useSettings } from "../state/settings";
import { en } from "./en";
import { type Dict, id, type MessageKey } from "./id";

const DICTS: Record<Lang, Dict> = { id, en };

export type { MessageKey };

export const translate = (
  lang: Lang,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string => {
  const text = DICTS[lang][key] ?? id[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
};

/** Penerjemah untuk komponen; ikut berubah saat bahasa diganti. */
export const useT = () => {
  const { lang } = useSettings();
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
};

/** Penerjemah di luar komponen (misalnya teks share). */
export const t = (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(getSettings().lang, key, vars);

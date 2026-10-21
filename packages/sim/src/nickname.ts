export const NICK_MIN = 3;
export const NICK_MAX = 16;

export type NicknameError = "too-short" | "too-long" | "invalid-chars" | "offensive";

export type NicknameResult = { ok: true; value: string } | { ok: false; error: NicknameError };

const ALLOWED = /^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$/;

// Kata panjang dicari sebagai potongan kata; kata pendek hanya dicocokkan utuh
// agar nama seperti "Pantai" atau "Pasukan" tidak ikut tertolak.
const BLOCK_SUBSTRING = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "pussy",
  "nigger",
  "nigga",
  "faggot",
  "whore",
  "slut",
  "bastard",
  "asshole",
  "anjing",
  "bangsat",
  "bajingan",
  "kontol",
  "memek",
  "ngentot",
  "ngewe",
  "jancok",
  "jancuk",
  "goblok",
  "tolol",
  "kampret",
  "pepek",
  "peler",
];
const BLOCK_WORD = ["anjg", "asu", "tai", "babi", "dick", "rape", "bego", "jembut", "coli"];

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
};

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("");

export const isOffensive = (nick: string): boolean => {
  const n = normalize(nick);
  const squashed = n.replace(/[^a-z]/g, "");
  if (BLOCK_SUBSTRING.some((w) => squashed.includes(w))) return true;
  const words = n.split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => BLOCK_WORD.includes(w));
};

/** Validasi nickname; dipakai di client dan server dengan aturan yang sama. */
export const validateNickname = (raw: string): NicknameResult => {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < NICK_MIN) return { ok: false, error: "too-short" };
  if (value.length > NICK_MAX) return { ok: false, error: "too-long" };
  if (!ALLOWED.test(value)) return { ok: false, error: "invalid-chars" };
  if (isOffensive(value)) return { ok: false, error: "offensive" };
  return { ok: true, value };
};

/** Bedakan nickname kembar di satu room dengan akhiran `#2`. */
export const dedupeNickname = (nick: string, taken: readonly string[]): string => {
  if (!taken.includes(nick)) return nick;
  let i = 2;
  while (taken.includes(`${nick}#${i}`)) i++;
  return `${nick}#${i}`;
};

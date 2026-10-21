import { describe, expect, it } from "vitest";
import { dedupeNickname, validateNickname } from "./nickname";

describe("nickname", () => {
  it("menerima nickname sah dan merapikan spasi", () => {
    expect(validateNickname("  Pink  Ponk_7 ")).toEqual({ ok: true, value: "Pink Ponk_7" });
  });

  it.each([
    ["ab", "too-short"],
    ["abcdefghijklmnopq", "too-long"],
    ["<script>", "invalid-chars"],
    ["héllo", "invalid-chars"],
    ["anjing123", "offensive"],
    ["Fu_ck", "offensive"],
    ["sh1t head", "offensive"],
    ["si tai", "offensive"],
  ])("%s → %s", (nick, error) => {
    const r = validateNickname(nick);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(error);
  });

  it("tidak menolak kata biasa yang mengandung potongan kata kasar pendek", () => {
    expect(validateNickname("Pantai").ok).toBe(true);
    expect(validateNickname("Pasukan").ok).toBe(true);
  });

  it("nickname kembar diberi akhiran", () => {
    expect(dedupeNickname("Rara", ["Rara"])).toBe("Rara#2");
    expect(dedupeNickname("Rara", ["Rara", "Rara#2"])).toBe("Rara#3");
    expect(dedupeNickname("Rara", ["Budi"])).toBe("Rara");
  });
});

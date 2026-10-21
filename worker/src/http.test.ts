import { describe, expect, it } from "vitest";
import { isAllowedOrigin, parseEventPayload, parseOrigins } from "./http";

describe("http", () => {
  const allowed = parseOrigins(
    "https://pinkponk.panduarah.my.id, https://pinkponk-dev.panduarah.my.id",
  );

  it("hanya menerima origin yang terdaftar", () => {
    const req = (origin?: string) =>
      new Request("https://pinkponk.panduarah.my.id/api/room", {
        method: "POST",
        headers: origin ? { Origin: origin } : {},
      });
    expect(isAllowedOrigin(req("https://pinkponk.panduarah.my.id"), allowed)).toBe(true);
    expect(isAllowedOrigin(req("https://evil.example"), allowed)).toBe(false);
    expect(isAllowedOrigin(req(), allowed)).toBe(false);
  });

  it("event analitik hanya dari daftar tetap", () => {
    expect(parseEventPayload(JSON.stringify({ e: "match_start", mode: "ai" }))).toEqual({
      e: "match_start",
      mode: "ai",
    });
    expect(parseEventPayload(JSON.stringify({ e: "match_start", mode: "rahasia" }))?.mode).toBe(
      "none",
    );
    expect(parseEventPayload(JSON.stringify({ e: "drop_table" }))).toBeNull();
    expect(parseEventPayload("x".repeat(600))).toBeNull();
  });
});

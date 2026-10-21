import type { AnalyticsEvent } from "@pinkponk/protocol";

type Mode = "swing" | "timing" | "local" | "ai" | "none";

let errorSent = false;

/** Hitungan anonim (jenis kejadian + mode) ke /api/event. Gagal kirim diabaikan. */
export const sendEvent = (e: AnalyticsEvent, mode: Mode = "none"): void => {
  if (__E2E__) return;
  try {
    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ e, mode }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Jaringan tidak tersedia.
  }
};

export const trackErrors = (): void => {
  const report = () => {
    if (errorSent) return;
    errorSent = true;
    sendEvent("js_error");
  };
  window.addEventListener("error", report);
  window.addEventListener("unhandledrejection", report);
};

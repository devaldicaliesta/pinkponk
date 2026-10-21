import { type Browser, type BrowserContext, test as base, type Page } from "@playwright/test";

export interface TestHooks {
  setTimeScale(n: number): void;
  autoplay(): void;
  crossing(): { atMs: number } | null;
  viewMs(): number;
  tapNow(): void;
  view(): { phase: string; points: [number, number]; tick: number; winner: number | null };
}

declare global {
  interface Window {
    __pp: TestHooks;
  }
}

type ContextOptions = Parameters<Browser["newContext"]>[0];

/** Halaman dengan nickname dan tutorial sudah selesai, supaya test langsung ke inti. */
const readyPage = async (
  browser: Browser,
  nickname = "Rara",
  extra: Record<string, unknown> = {},
  contextOptions: ContextOptions = {},
) => {
  const context = await browser.newContext(contextOptions);
  await context.addInitScript(
    ([n, e]) => {
      if (!localStorage.getItem("pp.settings")) {
        localStorage.setItem(
          "pp.settings",
          JSON.stringify({ nickname: n, tutorialDone: true, lang: "id", sound: false, ...e }),
        );
      }
    },
    [nickname, extra] as const,
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { context, page, errors };
};

/** Pemain servis lebih dulu; tap untuk servis begitu fase servis tiba. */
export const serveNow = async (page: Page) => {
  await waitForPhase(page, "serve");
  await page.evaluate(() => window.__pp.tapNow());
  await waitForPhase(page, "rally");
};

export const startAiGame = async (page: Page, mode: "ai" | "timing", difficulty = "Mudah") => {
  await page.goto("/");
  await page.getByTestId(`mode-${mode}`).click();
  await page.getByRole("button", { name: difficulty, exact: true }).click();
  await page.getByRole("button", { name: "Best of 1" }).click();
  await page.getByTestId("start").click();
  await page.getByTestId("game-canvas").waitFor();
  await page.waitForFunction(() => typeof window.__pp?.view === "function");
};

export const waitForPhase = (page: Page, phase: string, timeout = 30_000) =>
  page.waitForFunction((p) => window.__pp.view().phase === p, phase, { timeout });

/**
 * Tunggu bola menuju pemain lalu tap pada `offsetMs` dari waktu ideal (ms simulasi).
 * Bila giliran servis jatuh ke pemain (misalnya AI gagal mengembalikan), servis dulu.
 */
export const tapAt = (page: Page, offsetMs: number) =>
  page.evaluate(
    (offset) =>
      new Promise<void>((resolve, reject) => {
        const started = performance.now();
        let servedAt = -1;
        const loop = () => {
          const v = window.__pp.view() as { phase: string; server: number; phaseTick: number };
          if (v.phase === "serve" && v.server === 0 && servedAt !== v.phaseTick) {
            servedAt = v.phaseTick;
            window.__pp.tapNow();
          }
          const c = window.__pp.crossing();
          if (c && c.atMs + offset - window.__pp.viewMs() <= 2) {
            window.__pp.tapNow();
            resolve();
            return;
          }
          if (performance.now() - started > 60_000) reject(new Error("bola tidak datang"));
          else requestAnimationFrame(loop);
        };
        loop();
      }),
    offsetMs,
  );

/** Servis setiap kali giliran pemain, tanpa pernah memukul, sampai `done()` di halaman benar. */
export const serveUntilJudged = (page: Page, grade: string) =>
  page.evaluate(
    (g) =>
      new Promise<void>((resolve, reject) => {
        const started = performance.now();
        let servedAt = -1;
        const loop = () => {
          const v = window.__pp.view() as { phase: string; server: number; phaseTick: number };
          if (v.phase === "serve" && v.server === 0 && servedAt !== v.phaseTick) {
            servedAt = v.phaseTick;
            window.__pp.tapNow();
          }
          if (document.querySelector("[data-testid=judge]")?.textContent === g) resolve();
          else if (performance.now() - started > 90_000) reject(new Error(`tidak ada ${g}`));
          else requestAnimationFrame(loop);
        };
        loop();
      }),
    grade,
  );

export type Opened = Awaited<ReturnType<typeof readyPage>>;

export type OpenFn = (
  nickname?: string,
  extra?: Record<string, unknown>,
  options?: ContextOptions,
) => Promise<Opened>;

/**
 * `open` membuat context siap pakai dan menutupnya setelah test. Context yang dibiarkan
 * terbuka tetap menjalankan pertandingan dan memperlambat test berikutnya.
 */
export const test = base.extend<{ open: OpenFn }>({
  open: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (nickname, extra, options) => {
      const opened = await readyPage(browser, nickname, extra, options);
      contexts.push(opened.context);
      return opened;
    });
    for (const c of contexts) await c.close();
  },
});

export { expect } from "@playwright/test";

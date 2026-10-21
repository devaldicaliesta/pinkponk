import { expect, startAiGame, tapAt, test, waitForPhase } from "./helpers";

test("Gamble: stack penuh → tombol GAMBLE → roulette → kemampuan aktif @mobile", async ({
  open,
}) => {
  const { page, errors } = await open();
  await startAiGame(page, "gamble");
  await expect(page.getByTestId("gamble-bar")).toBeVisible();
  await expect(page.getByTestId("gamble-button")).toBeDisabled();
  await waitForPhase(page, "serve");
  await page.evaluate(() => window.__pp.fillStack());
  const button = page.getByTestId("gamble-button");
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByTestId("roulette")).toBeVisible();
  await page.waitForFunction(() => {
    const g = window.__pp.view().gamble[0];
    return g.ability !== null || g.armed;
  });
  expect(await page.evaluate(() => window.__pp.view().gamble[0].stack)).toBe(0);
  expect(errors).toEqual([]);
});

test("Gamble vs AI selesai, hadiah XP muncul, dan level tampil di menu", async ({ open }) => {
  const { page, errors } = await open();
  await startAiGame(page, "gamble");
  await page.evaluate(() => {
    window.__pp.autoplay();
    window.__pp.setTimeScale(8);
  });
  await waitForPhase(page, "over", 120_000);
  await expect(page.getByTestId("reward")).toContainText("XP");
  await page.getByTestId("menu").click();
  await expect(page.getByTestId("level")).toContainText("Level");
  const xp = await page.evaluate(() => JSON.parse(localStorage.getItem("pp.progress") ?? "{}").xp);
  expect(xp).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("Peringkat: tab global dan pribadi bisa dibuka", async ({ open }) => {
  const { page, errors } = await open();
  await page.goto("/");
  await page.getByTestId("open-leaderboard").click();
  await expect(page.getByRole("heading", { name: "Peringkat" })).toBeVisible();
  // Server lokal mungkin kosong atau sudah berisi; keduanya sah.
  await expect(
    page.getByTestId("leaderboard-list").or(page.getByText("Belum ada pemain berperingkat")),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pribadi" }).click();
  await expect(page.getByText("Pencapaian")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Cari lawan acak: dua pemain dipasangkan ke pertandingan gamble yang sama", async ({
  open,
}) => {
  const a = await open("Rara");
  const b = await open("Budi");
  for (const p of [a.page, b.page]) {
    await p.goto("/");
    await p.getByTestId("mode-online").click();
    await p.getByRole("button", { name: "Gamble", exact: true }).click();
  }
  await a.page.getByTestId("quick-match").click();
  await expect(a.page.getByTestId("searching")).toBeVisible();
  await b.page.getByTestId("quick-match").click();
  await Promise.all([
    a.page.getByTestId("game-canvas").waitFor({ timeout: 20_000 }),
    b.page.getByTestId("game-canvas").waitFor({ timeout: 20_000 }),
  ]);
  await expect(a.page.getByTestId("gamble-bar")).toBeVisible();
  await expect(b.page.getByTestId("gamble-bar")).toBeVisible();
  await expect(a.page.getByText("Budi")).toBeVisible();
  expect([...a.errors, ...b.errors]).toEqual([]);
});

test("Cari lawan acak bisa dibatalkan", async ({ open }) => {
  const { page, errors } = await open();
  await page.goto("/");
  await page.getByTestId("mode-online").click();
  await page.getByTestId("quick-match").click();
  await expect(page.getByTestId("searching")).toBeVisible();
  await page.getByRole("button", { name: "Batal" }).click();
  await expect(page.getByTestId("quick-match")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Gamble dengan gaya Timing Smash: roulette lalu tap dinilai @mobile", async ({ open }) => {
  const { page, errors } = await open();
  await page.goto("/");
  await page.getByTestId("mode-gamble").click();
  await page.getByRole("button", { name: "Timing Smash", exact: true }).click();
  await page.getByRole("button", { name: "Mudah", exact: true }).click();
  await page.getByRole("button", { name: "Best of 1" }).click();
  await page.getByTestId("start").click();
  await page.getByTestId("game-canvas").waitFor();
  await page.waitForFunction(() => typeof window.__pp?.view === "function");
  await expect(page.getByTestId("gamble-bar")).toBeVisible();
  await waitForPhase(page, "serve");
  await page.evaluate(() => window.__pp.fillStack());
  await page.getByTestId("gamble-button").click();
  await expect(page.getByTestId("roulette")).toBeVisible();
  // Mode timing: tap tepat waktu menghasilkan penilaian (hanya ada di Timing Smash).
  await tapAt(page, 0);
  await expect(page.getByTestId("judge")).toBeVisible();
  expect(errors).toEqual([]);
});

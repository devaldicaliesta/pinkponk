import { expect, startAiGame, test, waitForPhase } from "./helpers";

test("E2: Vs AI Mudah dimainkan sampai pertandingan selesai", async ({ open }) => {
  const { page, errors } = await open();
  await startAiGame(page, "ai");
  await page.evaluate(() => {
    window.__pp.autoplay();
    window.__pp.setTimeScale(8);
  });
  await waitForPhase(page, "over", 100_000);
  await expect(page.getByTestId("result")).toBeVisible();
  const v = await page.evaluate(() => window.__pp.view());
  expect(v.winner).not.toBeNull();
  expect(Math.max(...v.points)).toBeGreaterThanOrEqual(11);
  expect(errors).toEqual([]);
});

test("E3: kamera bisa diganti ke semua POV saat bermain", async ({ open }) => {
  const { page, errors } = await open();
  await startAiGame(page, "ai");
  const povs: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Ganti kamera" }).click();
    povs.push(
      await page.evaluate(() => JSON.parse(localStorage.getItem("pp.settings") ?? "{}").pov),
    );
  }
  expect(new Set(povs)).toEqual(new Set(["classic", "first", "tv", "iso"]));
  expect(errors).toEqual([]);
});

test("E4: 2 pemain lokal dengan keyboard", async ({ open }) => {
  const { page } = await open();
  await page.goto("/");
  await page.getByTestId("mode-local").click();
  await page.getByTestId("start").click();
  await page.getByTestId("game-canvas").waitFor();
  await waitForPhase(page, "serve");
  // P1 servis dengan Spasi, P2 menggerakkan bat dengan panah.
  await page.keyboard.press("Space");
  await waitForPhase(page, "rally");
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(400);
  await page.keyboard.up("ArrowLeft");
  const bat = await page.evaluate(
    () => (window.__pp as unknown as { view(): { bats: [number, number] } }).view().bats[1],
  );
  expect(bat).toBeLessThan(-0.3);
});

test("Jeda menghentikan simulasi @mobile", async ({ open }) => {
  const { page } = await open();
  await startAiGame(page, "ai");
  await page.getByRole("button", { name: "Jeda" }).click();
  const t1 = await page.evaluate(() => window.__pp.view().tick);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__pp.view().tick)).toBe(t1);
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pp.view().tick)).toBeGreaterThan(t1);
});

test("Match point tampil di atas, tidak menutupi tengah layar @mobile", async ({ open }) => {
  const { page, errors } = await open();
  await startAiGame(page, "ai");
  await waitForPhase(page, "serve");
  await page.evaluate(() => window.__pp.setPoints(10, 5));
  const badge = page.getByTestId("badge");
  await expect(badge).toHaveText(/match point/i);
  const box = await badge.boundingBox();
  const viewport = page.viewportSize();
  // Label berada di bagian atas layar (di area skor), bukan di tengah meja.
  expect(box!.y + box!.height).toBeLessThan(viewport!.height * 0.25);
  expect(errors).toEqual([]);
});

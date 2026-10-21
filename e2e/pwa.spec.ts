import { expect, test } from "./helpers";

test("E9: setelah kunjungan pertama, Vs AI bisa dimulai saat offline", async ({ open }) => {
  const { page, context } = await open();
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Pastikan halaman dikendalikan service worker sebelum offline.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("mode-online")).toBeDisabled();
  await page.getByTestId("mode-ai").click();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("game-canvas")).toBeVisible();
});

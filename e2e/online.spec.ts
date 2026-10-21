import { expect, type OpenFn, test } from "./helpers";

const createAndJoin = async (open: OpenFn) => {
  const a = await open("Rara");
  const b = await open("Budi");
  await a.page.goto("/");
  await a.page.getByTestId("mode-online").click();
  await a.page.getByTestId("create-room").click();
  const code = (await a.page.getByTestId("room-code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await b.page.goto(`/r/${code}`);
  await Promise.all([
    a.page.getByTestId("game-canvas").waitFor(),
    b.page.getByTestId("game-canvas").waitFor(),
  ]);
  return { a, b, code };
};

test("E5: online 1v1 — buat room, gabung lewat link, pertandingan berjalan", async ({ open }) => {
  const { a, b } = await createAndJoin(open);
  await a.page.waitForFunction(() => window.__pp.view().phase === "rally", null, {
    timeout: 30_000,
  });
  const ta = await a.page.evaluate(() => window.__pp.view().tick);
  const tb = await b.page.evaluate(() => window.__pp.view().tick);
  // Kedua klien melihat pertandingan yang sama (selisih hanya karena waktu sampel).
  expect(Math.abs(ta - tb)).toBeLessThan(120);
  await expect(a.page.getByText("Budi")).toBeVisible();
  await expect(b.page.getByText("Rara")).toBeVisible();
  expect([...a.errors, ...b.errors]).toEqual([]);
});

test("E6: pemain terputus lalu tersambung ulang, pertandingan lanjut", async ({ open }) => {
  const { a, b } = await createAndJoin(open);
  await a.page.waitForTimeout(2000);
  await b.context.setOffline(true);
  await expect(a.page.locator(".overlay")).toContainText("terputus", { timeout: 20_000 });
  await b.context.setOffline(false);
  await expect(a.page.locator(".overlay")).toHaveCount(0, { timeout: 30_000 });
  const t1 = await a.page.evaluate(() => window.__pp.view().tick);
  await a.page.waitForTimeout(1000);
  expect(await a.page.evaluate(() => window.__pp.view().tick)).toBeGreaterThan(t1);
});

test("Jeda online: kedua pemain berhenti bersamaan, lalu lanjut", async ({ open }) => {
  const { a, b } = await createAndJoin(open);
  await a.page.waitForFunction(() => window.__pp.view().phase !== "countdown", null, {
    timeout: 30_000,
  });
  await a.page.getByRole("button", { name: "Jeda" }).click();
  await expect(a.page.getByTestId("pause-menu")).toBeVisible();
  await expect(b.page.getByTestId("pause-menu")).toContainText("Rara");
  const t1 = await b.page.evaluate(() => window.__pp.view().tick);
  await b.page.waitForTimeout(1500);
  expect(await b.page.evaluate(() => window.__pp.view().tick)).toBe(t1);
  await b.page.getByRole("button", { name: "Lanjut" }).click();
  await expect(a.page.getByTestId("pause-menu")).toHaveCount(0);
  await b.page.waitForTimeout(1000);
  expect(await b.page.evaluate(() => window.__pp.view().tick)).toBeGreaterThan(t1);
});

test("Kode room salah menampilkan pesan", async ({ open }) => {
  const { page } = await open();
  await page.goto("/r/ZZZZZZ");
  await expect(page.getByTestId("lobby-error")).toBeVisible();
});

import {
  expect,
  type OpenFn,
  serveNow,
  serveUntilJudged,
  startAiGame,
  tapAt,
  test,
} from "./helpers";

// Waktu diperlambat 4x agar jendela PERFECT (±50 ms) lebih lebar dari jitter frame.
const setup = async (open: OpenFn) => {
  const { page, errors } = await open();
  await startAiGame(page, "timing");
  await serveNow(page);
  await page.evaluate(() => window.__pp.setTimeScale(0.25));
  return { page, errors };
};

test("E7a: tap tepat waktu → PERFECT @mobile", async ({ open }) => {
  const { page } = await setup(open);
  await tapAt(page, 0);
  await expect(page.getByTestId("judge")).toHaveText("PERFECT");
});

test("E7b: tap 200 ms terlambat → LATE", async ({ open }) => {
  const { page } = await setup(open);
  await tapAt(page, 200);
  await expect(page.getByTestId("judge")).toHaveText("LATE");
});

test("E7c: tidak tap → MISS", async ({ open }) => {
  const { page } = await setup(open);
  await serveUntilJudged(page, "MISS");
});

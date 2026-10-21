import { expect, test } from "./helpers";

test("E1: nickname diisi sekali dan tersimpan setelah reload @mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nick-input").fill("Rara");
  await page.getByTestId("nick-save").click();
  await expect(page.getByTestId("mode-ai")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("mode-ai")).toBeVisible();
  await expect(page.getByText("Rara")).toBeVisible();
});

test("E10: nickname berisi HTML ditolak @mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nick-input").fill("<script>");
  await page.getByTestId("nick-save").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("mode-ai")).toHaveCount(0);
});

test("E8: tema tersimpan dan terpasang sebelum aplikasi dimuat", async ({ open }) => {
  const { page } = await open("Rara", {}, { colorScheme: "dark" });
  await page.goto("/");
  await page.getByTestId("open-settings").click();
  await page.getByRole("button", { name: "Terang", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // Atribut dipasang oleh /theme.js di <head>, sebelum bundle aplikasi berjalan.
  await page.route("**/assets/*.js", (route) => route.abort());
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

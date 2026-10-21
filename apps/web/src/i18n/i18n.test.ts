import { describe, expect, it } from "vitest";
import { en } from "./en";
import { id } from "./id";
import { translate } from "./index";

describe("i18n", () => {
  it("bahasa Inggris punya semua kunci bahasa Indonesia, dan sebaliknya", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort());
  });

  it("variabel di teks sama di kedua bahasa", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(id) as (keyof typeof id)[]) {
      expect(vars(en[key]), key).toEqual(vars(id[key]));
    }
  });

  it("mengisi variabel", () => {
    expect(translate("id", "app.hello", { name: "Rara" })).toBe("Hai, Rara");
    expect(translate("en", "setup.bestOfN", { n: 3 })).toBe("Best of 3");
  });
});

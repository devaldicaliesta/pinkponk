import { defineConfig } from "vitest/config";

// Uji beban terpisah dari `pnpm test` karena butuh beberapa menit.
export default defineConfig({
  test: {
    include: ["packages/*/stress/**/*.stress.ts", "worker/stress/**/*.stress.ts"],
    testTimeout: 15 * 60_000,
    pool: "forks",
  },
});

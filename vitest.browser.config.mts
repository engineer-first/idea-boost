import { defineConfig } from "vitest/config";

export default defineConfig({
  // ブラウザテストからも features のロジックを読めるよう、通常のテストと同じ別名を解決する。
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/browser/**/*.spec.ts"],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});

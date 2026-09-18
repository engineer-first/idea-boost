// Durable Object / Worker のテスト用 Vitest 設定。
// アプリ側 (jsdom) の vitest.config.mts とは実行環境が異なるため分離する。
// vitest-pool-workers 0.18 (Vitest 4 対応) からは defineWorkersConfig ではなく
// cloudflareTest プラグインで構成する。
// 実行: npm run test:workers
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./workers/migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./workers/wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          // テスト専用のセッション秘密。SESSION_SECRET は本番構成（wrangler.jsonc）に
          // 置かず、ここで注入する。既知漏洩値でも短すぎる値でもない任意の固定値。
          SESSION_SECRET: "test-only-session-secret-not-committed-to-prod",
        },
      },
    }),
  ],
  test: {
    include: ["workers/**/*.spec.ts"],
    exclude: ["workers/**/*.demo.spec.ts"],
    setupFiles: ["./workers/test-setup.ts"],
  },
});

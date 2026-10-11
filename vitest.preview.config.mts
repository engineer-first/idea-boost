import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./workers/migrations");
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./workers/wrangler.preview.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          SESSION_SECRET: "preview-test-only-session-secret-long-enough",
        },
      },
    }),
  ],
  test: {
    include: ["workers/**/*.preview.spec.ts"],
    setupFiles: ["./workers/test-setup.ts"],
  },
});

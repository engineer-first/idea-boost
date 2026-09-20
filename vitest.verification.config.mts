import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./workers/migrations");
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./workers/wrangler.verification-test.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          SESSION_SECRET: "test-only-session-secret-not-committed-to-prod",
          IDEA_BOOST_VERIFY: "true",
          VERIFICATION_CONTROL_TOKEN:
            "verification-test-token-at-least-32-characters",
        },
      },
    }),
  ],
  test: {
    include: ["workers/**/*.verification.spec.ts"],
    setupFiles: ["./workers/test-setup.ts"],
  },
});

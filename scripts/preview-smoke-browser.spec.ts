// @vitest-environment node
import { resolve } from "node:path";
import { it } from "vitest";
import { smokePreviewBundle } from "./preview-smoke.mts";

// build:preview → preview-bundle 後に明示実行する。通常のunit/CI buildは
// Chromiumのインストールを必須にしない。実Google本人2名の確認とは別。
// PREVIEW_BROWSER_SMOKE=true npm run test -- scripts/preview-smoke-browser.spec.ts
it.skipIf(process.env.PREVIEW_BROWSER_SMOKE !== "true")(
  "ローカルのRS256テストIdPの別2本人が実bundle/UI/WSで参加・共有・投票・再入室できる",
  async () => {
    await smokePreviewBundle(resolve(process.cwd()), { browser: true });
  },
  120_000,
);

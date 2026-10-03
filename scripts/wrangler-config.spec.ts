// @vitest-environment node
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { unstable_readConfig } from "wrangler";

afterEach(() => vi.unstubAllEnvs());

it.each(["workers/wrangler.jsonc", "wrangler.jsonc"])(
  "%s は環境変数なしで本番 D1 の所有アカウントを選ぶ",
  (path) => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
    const config = unstable_readConfig({
      config: fileURLToPath(new URL(`../${path}`, import.meta.url)),
    });
    expect(config.account_id).toBe("b50fc9e60dea7830912d07e616822266");
  },
);

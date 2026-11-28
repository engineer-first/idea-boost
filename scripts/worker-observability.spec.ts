// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { unstable_readConfig } from "wrangler";

// 本番の2つの Worker は、エラーと例外を Cloudflare の Workers Logs で後から
// 追えるようにする（#635）。設定から消えると、次のデプロイで収集が止まる。
const PRODUCTION_WORKER_CONFIGS = ["wrangler.jsonc", "workers/wrangler.jsonc"];

describe("本番 Worker の Workers Logs", () => {
  it.each(PRODUCTION_WORKER_CONFIGS)("%s はログを全件収集する", (path) => {
    const config = unstable_readConfig({
      config: fileURLToPath(new URL(`../${path}`, import.meta.url)),
    });
    expect(config.observability).toEqual({
      enabled: true,
      head_sampling_rate: 1,
    });
  });
});

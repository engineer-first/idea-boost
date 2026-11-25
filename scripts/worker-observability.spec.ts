import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// 本番の2つの Worker は、エラーと例外を Cloudflare の Workers Logs で後から
// 追えるようにする（#635）。設定から消えると、次のデプロイで収集が止まる。
const PRODUCTION_WORKER_CONFIGS = ["wrangler.jsonc", "workers/wrangler.jsonc"];

function readJsonc(path: string): Record<string, unknown> {
  const { config, error } = ts.parseConfigFileTextToJson(
    path,
    readFileSync(path, "utf8"),
  );
  if (error) throw new Error(`${path} を読めません`);
  return config as Record<string, unknown>;
}

describe("本番 Worker の Workers Logs", () => {
  it.each(PRODUCTION_WORKER_CONFIGS)("%s はログを全件収集する", (path) => {
    expect(readJsonc(path).observability).toEqual({
      enabled: true,
      head_sampling_rate: 1,
    });
  });
});

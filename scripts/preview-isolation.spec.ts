// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parse } from "yaml";

it.each([
  "preview.yml",
  "preview-api.yml",
])("%s はPreview専用tokenだけを渡す", (file) => {
  const workflow: {
    jobs: Record<string, { steps: Array<{ env?: Record<string, string> }> }>;
  } = parse(
    readFileSync(
      new URL(`../.github/workflows/${file}`, import.meta.url),
      "utf8",
    ),
  );
  const operations = Object.values(workflow.jobs)
    .flatMap((job) => job.steps)
    .filter((step) => step.env?.CLOUDFLARE_API_TOKEN);
  expect(operations.length).toBeGreaterThan(0);
  for (const step of operations)
    expect(step.env?.CLOUDFLARE_API_TOKEN).toBe(
      "$" + "{{ secrets.PREVIEW_CLOUDFLARE_API_TOKEN }}",
    );
});

it("token未設定のAPI操作はWranglerを起動する前に失敗する", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/preview-control.mts", "api"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: "",
        PREVIEW_D1_ID: "11111111-1111-4111-8111-111111111111",
        PREVIEW_API_COMMIT: "a".repeat(40),
      },
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "Preview設定 CLOUDFLARE_API_TOKEN が必要です。",
  );
  expect(result.stdout).not.toContain('"state":"started"');
});

// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { executeAutomation } from "./release-automation.mts";
import type { GitHubApi } from "./release-history.mts";

describe("自動記録の入口", () => {
  it.each([
    {},
    { RUN_ID: "123" },
    { RUN_ID: "123", RUN_ATTEMPT: "1", RELEASE_NOTE_JSON: "{}" },
  ])("再試行の入力が不足・混在する場合は書き込まない: %j", async (env) => {
    const api = vi.fn<GitHubApi>();
    await expect(
      executeAutomation(["retry", "--publish"], env, api),
    ).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });
  it("手動入力の成功確認が欠けていれば公開しない", async () => {
    const api = vi.fn<GitHubApi>();
    await expect(
      executeAutomation(
        ["retry", "--publish"],
        { RELEASE_NOTE_JSON: "{}" },
        api,
      ),
    ).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });
  it("未知のコマンドや余分な引数で公開しない", async () => {
    const api = vi.fn<GitHubApi>();
    await expect(
      executeAutomation(["actions", "123", "1", "--publish", "bad"], {}, api),
    ).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });
});

it("旧Deployの説明をreceiptで補完しても、成功を照合した同じ版に公開する", async () => {
  const { BASELINE_COMMIT } = await import("./release-history.mts");
  const commit = "a".repeat(40);
  const api = vi.fn<GitHubApi>(async (method, path, data) => {
    if (path === "/actions/runs/123/attempts/1")
      return {
        id: 123,
        run_attempt: 1,
        head_sha: commit,
        path: ".github/workflows/deploy.yml",
        event: "push",
        head_branch: "release",
        status: "completed",
      };
    if (path.endsWith("/jobs?per_page=100&page=1"))
      return {
        total_count: 4,
        jobs: ["gate", "deploy-api", "deploy-app", "health-check"].map(
          (name) => ({
            name,
            conclusion: "success",
            completed_at: "2026-09-26T03:00:00Z",
          }),
        ),
      };
    if (path.startsWith("/releases?")) return [];
    if (path.startsWith("/git/ref/tags/")) return null;
    if (path.startsWith("/compare/")) return { status: "ahead" };
    if (method === "POST" && path === "/releases")
      return {
        ...data,
        html_url:
          "https://github.com/engineer-first/idea-boost/releases/tag/prod-actions-123-1",
      };
    throw new Error(path);
  });
  const note = {
    commit,
    previousCommit: BASELINE_COMMIT,
    deployment: { kind: "actions", runId: 123, attempt: 1 },
    changes: [
      {
        kind: "内部変更",
        text: "公開手順を整理しました。操作に変更はありません。",
        prs: [367],
      },
    ],
    notices: [],
  };
  const output = await executeAutomation(
    ["retry", "--publish"],
    { RELEASE_NOTE_JSON: JSON.stringify(note) },
    api,
  );
  expect(output).toContain("prod-actions-123-1");
  expect(api.mock.calls.filter(([method]) => method === "POST")).toHaveLength(
    1,
  );
  expect(
    api.mock.calls.find(([method]) => method === "POST")?.[2]?.target_commitish,
  ).toBe(commit);
});

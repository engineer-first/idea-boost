// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BASELINE_COMMIT,
  type GitHubApi,
  recordRelease,
} from "./release-history.mts";

const commit = "a".repeat(40);
const deployedAt = "2026-09-26T03:00:00Z";
function note() {
  return {
    commit,
    previousCommit: BASELINE_COMMIT,
    deployment: { kind: "actions", runId: 123, attempt: 1 },
    changes: [
      {
        kind: "追加",
        text: "付箋を残したまま投票をやり直せます。",
        prs: [370, 371],
      },
    ],
    notices: ["投票数はリセットされます。"],
  };
}

function server() {
  const state = {
    run: {
      id: 123,
      run_attempt: 1,
      path: ".github/workflows/deploy.yml",
      event: "push",
      head_branch: "release",
      head_sha: commit,
      status: "completed",
      conclusion: "success",
    },
    jobs: ["gate", "deploy-api", "deploy-app", "health-check"].map((name) => ({
      name,
      conclusion: "success",
      completed_at: deployedAt,
    })),
    releases: [] as Record<string, unknown>[],
    tags: {} as Record<string, string>,
    compareStatus: "ahead",
  };
  const api = vi.fn<GitHubApi>(async (method, path, data) => {
    if (method === "POST" && path === "/releases") {
      const release = {
        ...data,
        html_url:
          "https://github.com/engineer-first/idea-boost/releases/tag/prod-actions-123-1",
      };
      state.releases.push(release);
      state.tags[String(data?.tag_name)] = String(data?.target_commitish);
      return release;
    }
    if (path === "/actions/runs/123/attempts/1") return state.run;
    if (path === "/actions/runs/123/attempts/1/jobs?per_page=100&page=1")
      return { jobs: state.jobs, total_count: state.jobs.length };
    if (path === "/releases?per_page=100&page=1") return state.releases;
    if (path.startsWith("/git/ref/tags/prod-"))
      return state.tags[path.split("/").at(-1) ?? ""] ? { ref: path } : null;
    if (path.startsWith("/commits/prod-"))
      return state.tags[path.split("/").at(-1) ?? ""]
        ? { sha: state.tags[path.split("/").at(-1) ?? ""] }
        : null;
    if (path.startsWith("/compare/")) return { status: state.compareStatus };
    throw new Error(`Unexpected API: ${method} ${path}`);
  });
  return { state, api };
}

describe("本番リリース履歴", () => {
  it("成功した本番の日時・commit・機能単位の要約と差分を、書き込みなしで確認できる", async () => {
    const { api } = server();
    const result = await recordRelease(note(), api, false);
    expect(result.body).toContain(deployedAt);
    expect(result.body).toContain(`/commit/${commit}`);
    expect(result.body).toContain(`/compare/${BASELINE_COMMIT}...${commit}`);
    expect(result.body).toContain("付箋を残したまま投票をやり直せます。");
    expect(result.body).toContain("/pull/370");
    expect(result.body).toContain("/pull/371");
    expect(result.body).toContain("投票数はリセットされます。");
    expect(api.mock.calls.every(([method]) => method === "GET")).toBe(true);
  });

  it.each([
    "failure",
    "cancelled",
    "in_progress",
  ])("Deployが%sなら公開しない", async (status) => {
    const { state, api } = server();
    state.run.conclusion = status;
    await expect(recordRelease(note(), api, true)).rejects.toThrow();
    expect(state.releases).toHaveLength(0);
  });

  it.each([
    "gate",
    "deploy-api",
    "deploy-app",
    "health-check",
  ])("%sの途中失敗・欠落を成功扱いしない", async (name) => {
    const { state, api } = server();
    state.jobs = state.jobs.filter((job) => job.name !== name);
    await expect(recordRelease(note(), api, true)).rejects.toThrow();
    expect(state.releases).toHaveLength(0);
  });

  it.each([
    { path: ".github/workflows/ci.yml" },
    { head_branch: "develop" },
    { event: "pull_request" },
    { head_sha: "b".repeat(40) },
    { run_attempt: 2 },
  ])("別のworkflow・ブランチ・commit・試行を公開しない: %j", async (override) => {
    const { state, api } = server();
    Object.assign(state.run, override);
    await expect(recordRelease(note(), api, true)).rejects.toThrow();
    expect(state.releases).toHaveLength(0);
  });

  it("応答を失った後の再実行でも同じ版を増やさず、訂正された本文を保持する", async () => {
    const { state, api } = server();
    await recordRelease(note(), api, true);
    state.releases[0].body = `訂正済み\n${state.releases[0].body}`;
    const result = await recordRelease(note(), api, true);
    expect(result.existing).toBe(true);
    expect(state.releases).toHaveLength(1);
    expect(state.releases[0].body).toMatch(/^訂正済み/);
    expect(api.mock.calls.filter(([method]) => method === "POST")).toHaveLength(
      1,
    );
  });

  it("既存タグが別commitを指すなら変更も公開もしない", async () => {
    const { state, api } = server();
    state.tags["prod-actions-123-1"] = "b".repeat(40);
    await expect(recordRelease(note(), api, true)).rejects.toThrow();
    expect(state.releases).toHaveLength(0);
  });

  it("前回commitの取り違えと巻き戻しを通常の差分として記録しない", async () => {
    const { state, api } = server();
    await expect(
      recordRelease({ ...note(), previousCommit: "b".repeat(40) }, api, true),
    ).rejects.toThrow();
    state.compareStatus = "diverged";
    await expect(recordRelease(note(), api, true)).rejects.toThrow();
    expect(state.releases).toHaveLength(0);
  });

  it("要約と関連PRのない変更を拒否する", async () => {
    const { api } = server();
    await expect(
      recordRelease({ ...note(), changes: [] }, api, true),
    ).rejects.toThrow();
    await expect(
      recordRelease(
        { ...note(), changes: [{ kind: "修正", text: "", prs: [] }] },
        api,
        true,
      ),
    ).rejects.toThrow();
  });

  it("手動デプロイは全段階の確認と証跡を必要とし、公開時刻から同じ版を識別する", async () => {
    const { state, api } = server();
    const manual = {
      ...note(),
      deployment: {
        kind: "manual",
        completedAt: deployedAt,
        evidenceUrl: "https://github.com/engineer-first/idea-boost/issues/400",
        migration: true,
        api: true,
        app: true,
        health: true,
      },
    };
    await expect(
      recordRelease(
        { ...manual, deployment: { ...manual.deployment, api: false } },
        api,
        true,
      ),
    ).rejects.toThrow();
    const result = await recordRelease(manual, api, true);
    expect(result.tag).toBe("prod-manual-20260926T030000Z");
    expect(result.body).toContain("手動デプロイ");
    expect(result.body).toContain("/issues/400");
    expect(state.releases).toHaveLength(1);
  });
});

function manualNote() {
  return {
    ...note(),
    deployment: {
      kind: "manual",
      completedAt: "2026-09-26T04:00:00Z",
      evidenceUrl: "https://github.com/engineer-first/idea-boost/issues/400",
      migration: true,
      api: true,
      app: true,
      health: true,
    },
  };
}

describe("履歴の継続とエラー処理", () => {
  it("2件目は直前の本番との差分に結び、初回基準を繰り返さない", async () => {
    const { state, api } = server();
    await recordRelease(note(), api, true);
    const next = {
      ...manualNote(),
      commit: "b".repeat(40),
      previousCommit: commit,
    };
    await expect(
      recordRelease({ ...next, previousCommit: BASELINE_COMMIT }, api, true),
    ).rejects.toThrow();
    const result = await recordRelease(next, api, true);
    expect(result.body).toContain(`/compare/${commit}...${next.commit}`);
    expect(result.body).not.toContain("記録開始基準");
    expect(state.releases).toHaveLength(2);
  });

  it("内部変更のみの再デプロイも説明とPRを残し、空の注意欄を作らない", async () => {
    const { state, api } = server();
    state.compareStatus = "identical";
    const result = await recordRelease(
      {
        ...note(),
        notices: [],
        changes: [
          {
            kind: "内部変更",
            text: "利用者の操作に変更はありません。再デプロイしました。",
            prs: [370],
          },
        ],
      },
      api,
      false,
    );
    expect(result.body).toContain("内部変更");
    expect(result.body).not.toContain("## 利用上の注意");
  });

  it.each([
    "draft",
    "prerelease",
  ])("既存版が%sなら勝手に公開しない", async (field) => {
    const { state, api } = server();
    await recordRelease(note(), api, true);
    state.releases[0][field] = true;
    await expect(recordRelease(note(), api, true)).rejects.toThrow();
    expect(state.releases).toHaveLength(1);
  });

  it("公開情報の不一致と欠損を上書きしない", async () => {
    const { state, api } = server();
    await recordRelease(note(), api, true);
    await expect(
      recordRelease({ ...note(), previousCommit: "b".repeat(40) }, api, true),
    ).rejects.toThrow();
    state.releases[0].body = "識別情報を消した本文";
    await expect(recordRelease(note(), api, true)).rejects.toThrow();
    expect(state.releases).toHaveLength(1);
  });

  it("作成の応答だけ失われた場合も再試行で既存版を返す", async () => {
    const { state, api } = server();
    const lossyApi: GitHubApi = async (...args) => {
      const response = await api(...args);
      if (args[0] === "POST") throw new Error("timeout after creation");
      return response;
    };
    await expect(recordRelease(note(), lossyApi, true)).rejects.toThrow(
      "timeout",
    );
    expect((await recordRelease(note(), api, true)).existing).toBe(true);
    expect(state.releases).toHaveLength(1);
  });

  it("履歴APIの失敗を初回公開とみなさない", async () => {
    const { state, api } = server();
    const failingApi: GitHubApi = async (...args) => {
      if (args[1].startsWith("/releases?")) throw new Error("HTTP 403");
      return api(...args);
    };
    await expect(recordRelease(note(), failingApi, true)).rejects.toThrow(
      "403",
    );
    expect(state.releases).toHaveLength(0);
  });

  it("100件目より後にある既存版も重複させない", async () => {
    const { state, api } = server();
    await recordRelease(note(), api, true);
    const pagedApi: GitHubApi = async (...args) => {
      if (args[1] === "/releases?per_page=100&page=1") {
        return Array.from({ length: 100 }, (_, i) => ({
          ...state.releases[0],
          tag_name: `other-${i}`,
        }));
      }
      if (args[1] === "/releases?per_page=100&page=2") return state.releases;
      return api(...args);
    };
    expect((await recordRelease(note(), pagedApi, true)).existing).toBe(true);
    expect(state.releases).toHaveLength(1);
  });
});

describe("記録CLI（外部GitHubには接続しない）", () => {
  it("gh経由でもプレビューはGETだけ、明示公開だけが正しいcommitでPOSTする", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-history-"));
    try {
      const log = join(dir, "calls.jsonl");
      const file = join(dir, "note.json");
      writeFileSync(file, JSON.stringify(manualNote()));
      writeFileSync(
        join(dir, "gh"),
        `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
const path = args.find(arg => arg.startsWith('repos/'));
if (path.includes('/git/ref/tags/')) { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
if (args.includes('POST')) {
  const data = JSON.parse(fs.readFileSync(0, 'utf8'));
  fs.writeFileSync(${JSON.stringify(join(dir, "created.json"))}, JSON.stringify(data));
  console.log(JSON.stringify({ ...data, html_url: 'https://github.com/engineer-first/idea-boost/releases/tag/test' }));
} else if (path.includes('/releases?')) console.log('[]');
else if (path.includes('/compare/')) console.log('{"status":"ahead"}');
else process.exit(2);
`,
        { mode: 0o755 },
      );
      const options = {
        encoding: "utf8" as const,
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
        stdio: "pipe" as const,
      };
      const command = [resolve("scripts/release-history.mts"), file];
      const preview = execFileSync(process.execPath, command, options);
      expect(preview).toContain("prod-manual-20260926T040000Z");
      expect(readFileSync(log, "utf8")).not.toContain('"POST"');
      execFileSync(process.execPath, [...command, "--publish"], options);
      const created = JSON.parse(
        readFileSync(join(dir, "created.json"), "utf8"),
      );
      expect(created.target_commitish).toBe(commit);
      expect(created.tag_name).toBe("prod-manual-20260926T040000Z");
      expect(created.draft).toBe(false);
      expect(readFileSync(log, "utf8")).toContain('"--input","-"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

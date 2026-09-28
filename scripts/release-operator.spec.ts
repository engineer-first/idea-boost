// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { PromotionApi } from "./promote-release.mts";
import {
  BASELINE_COMMIT,
  type GitHubApi,
  prepareRelease,
} from "./release-history.mts";
import {
  executeRelease,
  inspectRelease,
  promoteApproved,
  retryRecord,
} from "./release-operator.mts";

const sha = "a".repeat(40);
function server() {
  const state = { sha, runs: [] as Record<string, unknown>[] };
  const api = vi.fn<GitHubApi>(async (method, path) => {
    if (method === "POST") return null;
    if (
      path.startsWith("/contents/.github/release-note.json?ref=release-plan-")
    )
      return null;
    if (path.startsWith("/releases?")) return [];
    if (path.startsWith("/actions/workflows/"))
      return { workflow_runs: state.runs };
    if (path === "/git/ref/heads/develop")
      return { object: { sha: state.sha } };
    if (path === "/git/ref/heads/release")
      return { object: { sha: BASELINE_COMMIT } };
    if (path.startsWith("/compare/"))
      return {
        status: "ahead",
        total_commits: 1,
        commits: [{ sha, commit: { message: "付箋保存を修正" } }],
        files: [
          {
            filename: "features/notes/save.ts",
            status: "modified",
            patch: "fix save",
          },
        ],
      };
    if (path.startsWith(`/commits/${sha}/pulls`))
      return [
        {
          number: 370,
          title: "付箋保存",
          body: "保存に失敗する問題を修正",
          merged_at: "2026-09-26T03:00:00Z",
          base: { ref: "develop" },
        },
      ];
    throw new Error(`Unexpected ${path}`);
  });
  return { state, api };
}
describe("releaseオペレーター", () => {
  it("開始は読取だけで比較元・候補・関連PR・差分を集める", async () => {
    const { api } = server();
    const result = await inspectRelease(api);
    expect(result.status).toBe("ready");
    expect(result.candidate).toBe(sha);
    expect(result.previousCommit).toBe(BASELINE_COMMIT);
    expect(result.prs[0].number).toBe(370);
    expect(result.files[0].filename).toBe("features/notes/save.ts");
    expect(api.mock.calls.every(([method]) => method === "GET")).toBe(true);
  });
  it("公開意思がないと書き込まず、同意後も更新された候補は拒否する", async () => {
    const { state, api } = server();
    const snapshot = await inspectRelease(api);
    const draft = {
      snapshot,
      plan: {
        title: "付箋の保存を改善",
        previousCommit: BASELINE_COMMIT,
        changes: [
          {
            kind: "修正",
            text: "付箋を保存できない問題を直しました。",
            prs: [370],
          },
        ],
        notices: [],
      },
    };
    await expect(executeRelease(draft, "edit", api)).rejects.toThrow();
    state.sha = "b".repeat(40);
    await expect(executeRelease(draft, "release", api)).rejects.toThrow();
    expect(api.mock.calls.some(([method]) => method === "POST")).toBe(false);
  });
  it("公開同意で通常のPromoteを対象と説明付きで一度起動する", async () => {
    const { api } = server();
    const snapshot = await inspectRelease(api);
    await executeRelease(
      {
        snapshot,
        plan: {
          title: "付箋の保存を改善",
          previousCommit: BASELINE_COMMIT,
          changes: [{ kind: "修正", text: "付箋を保存できます。", prs: [370] }],
          notices: [],
        },
      },
      "release",
      api,
    );
    expect(api.mock.calls.filter(([method]) => method === "POST")).toEqual([
      [
        "POST",
        "/actions/workflows/promote-release.yml/dispatches",
        expect.objectContaining({
          ref: "develop",
          inputs: expect.objectContaining({ expected_sha: sha }),
        }),
      ],
    ]);
  });
});

it("Record Release待機中は再dispatchを促さない", async () => {
  const { api } = server();
  const withRecord: GitHubApi = async (method, path, data) =>
    path.startsWith("/actions/workflows/release-history.yml/runs?")
      ? {
          workflow_runs: [
            {
              id: 900,
              run_attempt: 1,
              status: "queued",
              updated_at: "2026-09-27T03:00:00Z",
            },
          ],
        }
      : api(method, path, data);
  expect((await inspectRelease(withRecord)).status).toBe("running");
});

const plan = {
  title: "付箋の保存を改善",
  previousCommit: BASELINE_COMMIT,
  mode: "release",
  changes: [{ kind: "修正", text: "付箋を保存できます。", prs: [370] }],
  notices: [],
};
function deploymentServer(success: boolean) {
  const { api: base } = server();
  const run = {
    id: 77,
    run_attempt: 2,
    status: "completed",
    updated_at: "2026-09-27T03:00:00Z",
    head_sha: sha,
    path: ".github/workflows/deploy.yml",
    event: "workflow_dispatch",
    head_branch: "release",
  };
  const api = vi.fn<GitHubApi>(async (method, path, data) => {
    if (path.startsWith("/actions/workflows/deploy.yml/runs?"))
      return { workflow_runs: [run] };
    if (path === "/actions/runs/77/attempts/2") return run;
    if (path.includes("/jobs?"))
      return {
        total_count: 4,
        jobs: ["gate", "deploy-api", "deploy-app", "health-check"].map(
          (name) => ({
            name,
            conclusion:
              name === "health-check" && !success ? "failure" : "success",
            completed_at: "2026-09-27T02:50:00Z",
          }),
        ),
      };
    return base(method, path, data);
  });
  return api;
}
it("health未成功は途中失敗、成功した未記録runは自動で記録回復へ送る", async () => {
  const failed = deploymentServer(false);
  expect((await inspectRelease(failed)).status).toBe("deployment-failed");
  await expect(retryRecord(failed)).rejects.toThrow();
  expect(failed.mock.calls.some(([method]) => method === "POST")).toBe(false);
  const succeeded = deploymentServer(true);
  expect((await inspectRelease(succeeded)).status).toBe("retry-record");
  await retryRecord(succeeded);
  expect(succeeded).toHaveBeenLastCalledWith(
    "POST",
    "/actions/workflows/release-history.yml/dispatches",
    { ref: "develop", inputs: { run_id: "77", attempt: "2" } },
  );
});
it("読取API障害を新規公開可能と解釈しない", async () => {
  const api = vi.fn<GitHubApi>(async () => {
    throw new Error("HTTP 503");
  });
  await expect(inspectRelease(api)).rejects.toThrow("503");
  expect(api.mock.calls.some(([method]) => method !== "GET")).toBe(false);
});
it("公開dispatchの応答喪失後はGitHubの実行中状態から再開し、二度起動しない", async () => {
  const { api: base } = server();
  let dispatched = false;
  const api = vi.fn<GitHubApi>(async (method, path, data) => {
    if (method === "POST") {
      dispatched = true;
      throw new Error("response lost");
    }
    if (
      dispatched &&
      path.startsWith("/actions/workflows/promote-release.yml/runs?")
    )
      return {
        workflow_runs: [
          {
            id: 88,
            run_attempt: 1,
            status: "queued",
            updated_at: "2026-09-27T03:00:00Z",
          },
        ],
      };
    return base(method, path, data);
  });
  const draft = { snapshot: await inspectRelease(api), plan };
  await expect(executeRelease(draft, "release", api)).rejects.toThrow(
    "response lost",
  );
  expect((await inspectRelease(api)).status).toBe("running");
  await expect(executeRelease(draft, "release", api)).rejects.toThrow();
  expect(api.mock.calls.filter(([method]) => method === "POST")).toHaveLength(
    1,
  );
});
function promotionServer() {
  const { api: base, state: source } = server();
  const state = {
    saved: null as null | { encoding: string; content: string },
    release: BASELINE_COMMIT,
    treeContent: "",
    updates: 0,
    dispatches: 0,
  };
  const api = vi.fn<PromotionApi>(async (method, path, data) => {
    if (
      path.startsWith("/contents/.github/release-note.json?ref=release-plan-")
    )
      return path.endsWith(`release-plan-${sha}`) ? state.saved : null;
    if (path === `/compare/release...${sha}`)
      return {
        status: state.release === sha ? "identical" : "ahead",
        base_commit: { sha: state.release },
      };
    if (path === "/git/ref/heads/release")
      return { object: { sha: state.release } };
    if (path === "/git/trees") {
      state.treeContent = String(
        (data?.tree as { content: string }[])[0].content,
      );
      return { sha: "c".repeat(40) };
    }
    if (path === "/git/commits") return { sha: "d".repeat(40) };
    if (path === "/git/refs") {
      state.saved = {
        encoding: "base64",
        content: Buffer.from(state.treeContent).toString("base64"),
      };
      return null;
    }
    if (method === "PATCH") {
      state.release = String(data?.sha);
      state.updates++;
      return null;
    }
    if (method === "POST" && path.endsWith("/dispatches")) {
      state.dispatches++;
      return null;
    }
    return base(method, path, data);
  });
  return { api, state, source };
}
it("承認した説明を永続化し、対象コードを変えず公開し、別セッションのDeployが同じ説明を使う", async () => {
  const { api, state } = promotionServer();
  await promoteApproved(sha, plan, api);
  expect(state.release).toBe(sha);
  expect(state.updates).toBe(1);
  expect(state.dispatches).toBe(1);
  expect(
    api.mock.calls.find(([, path]) => path === "/git/commits")?.[2],
  ).toMatchObject({ parents: [sha] });
  expect(api.mock.calls.find(([, path]) => path === "/git/refs")?.[2]).toEqual({
    ref: `refs/tags/release-plan-${sha}`,
    sha: "d".repeat(40),
  });
  expect((await prepareRelease(sha, api)).title).toBe(plan.title);
  await expect(
    promoteApproved(sha, { ...plan, title: "勝手に修正" }, api),
  ).rejects.toThrow("保存済み");
  expect(state.dispatches).toBe(1);
});
it("Actions実行までにdevelopが進んでいたら保存も本番更新もしない", async () => {
  const { api, state, source } = promotionServer();
  source.sha = "b".repeat(40);
  await expect(promoteApproved(sha, plan, api)).rejects.toThrow();
  expect(state.saved).toBeNull();
  expect(state.updates).toBe(0);
  expect(state.dispatches).toBe(0);
});

it("説明保存後のdispatch失敗を別セッションで復元し、同じ説明を確認して再開する", async () => {
  const { api: base, state } = promotionServer();
  let failDispatch = true;
  const failedRun = {
    id: 921,
    run_attempt: 1,
    status: "completed",
    conclusion: "failure",
    updated_at: "2026-09-27T03:00:00Z",
    head_sha: "b".repeat(40),
    display_title: `Release candidate: ${sha}`,
  };
  const api: PromotionApi = async (method, path, data) => {
    if (
      method === "POST" &&
      path === "/actions/workflows/deploy.yml/dispatches" &&
      failDispatch
    )
      throw new Error("dispatch unavailable");
    if (
      state.saved &&
      path.startsWith("/actions/workflows/promote-release.yml/runs?")
    )
      return { workflow_runs: [failedRun] };
    return base(method, path, data);
  };
  await expect(promoteApproved(sha, plan, api)).rejects.toThrow(
    "dispatch unavailable",
  );
  expect(state.release).toBe(sha);
  const snapshot = await inspectRelease(api);
  expect(snapshot.savedPlan).toMatchObject({
    commit: sha,
    plan,
    promotionRun: { id: 921 },
  });
  // 新しいチャットは昔のdraftを使わず、statusから復元した内容を再提示する。
  await expect(
    executeRelease({ snapshot, plan: snapshot.savedPlan?.plan }, "edit", api),
  ).rejects.toThrow();
  await executeRelease(
    { snapshot, plan: snapshot.savedPlan?.plan },
    "release",
    api,
  );
  failDispatch = false;
  await promoteApproved(sha, snapshot.savedPlan?.plan, api);
  expect(state.updates).toBe(1);
  expect(
    base.mock.calls.filter(([, path]) => path === "/git/refs"),
  ).toHaveLength(1);
  expect(
    base.mock.calls.filter(
      ([, path]) => path === "/actions/workflows/deploy.yml/dispatches",
    ),
  ).toHaveLength(1);
});
it("失敗runのhead_shaだけで保存計画と誤って結び付けない", async () => {
  const { api: base, state } = promotionServer();
  await promoteApproved(sha, plan, base);
  const api: GitHubApi = async (method, path, data) => {
    if (path.startsWith("/actions/workflows/promote-release.yml/runs?"))
      return {
        workflow_runs: [
          {
            id: 922,
            run_attempt: 1,
            status: "completed",
            conclusion: "failure",
            updated_at: "2026-09-27T03:00:00Z",
            head_sha: sha,
            display_title: `Release candidate: ${"b".repeat(40)}`,
          },
        ],
      };
    return base(method, path, data);
  };
  expect(state.saved).not.toBeNull();
  const snapshot = await inspectRelease(api);
  expect(snapshot.savedPlan?.plan).toEqual(plan);
  expect(snapshot.savedPlan?.promotionRun).toBeUndefined();
});
it("develop更新後は古い保存説明を新候補へ流用せず、対象付きの前回情報へ分ける", async () => {
  const { api, state, source } = promotionServer();
  await promoteApproved(sha, plan, api);
  source.sha = "b".repeat(40);
  const snapshot = await inspectRelease(api);
  expect(snapshot.candidate).toBe(source.sha);
  expect(snapshot.savedPlan).toBeUndefined();
  expect(snapshot.previousPromotion).toMatchObject({ commit: sha, plan });
  expect(state.release).toBe(sha);
  await expect(
    executeRelease(
      {
        snapshot: { ...snapshot, candidate: sha },
        plan: snapshot.previousPromotion?.plan,
      },
      "release",
      api,
    ),
  ).rejects.toThrow("候補");
});

it("同じ候補の新しいPromoteが成功したら古い失敗runを復旧理由として表示しない", async () => {
  const { api: base } = promotionServer();
  await promoteApproved(sha, plan, base);
  const api: GitHubApi = async (method, path, data) => {
    if (path.startsWith("/actions/workflows/promote-release.yml/runs?"))
      return {
        workflow_runs: [
          {
            id: 924,
            run_attempt: 1,
            status: "completed",
            conclusion: "success",
            updated_at: "2026-09-27T04:00:00Z",
            display_title: `Release candidate: ${sha}`,
          },
          {
            id: 923,
            run_attempt: 1,
            status: "completed",
            conclusion: "failure",
            updated_at: "2026-09-27T03:00:00Z",
            display_title: `Release candidate: ${sha}`,
          },
        ],
      };
    return base(method, path, data);
  };
  expect((await inspectRelease(api)).savedPlan?.promotionRun).toBeUndefined();
});

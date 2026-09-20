import { describe, expect, it, vi } from "vitest";
import { parseIssueReference } from "./issue-status-policy.js";
import { syncIssueProjectStatus } from "./sync-issue-project-status.js";

function fixture({
  status = "着手可能",
  type = "Task",
  permission = "write",
} = {}) {
  const state = {
    status,
    stamp: "2026-09-20T00:00:00Z",
    record: "",
    changes: [] as string[],
    type,
    children: 0,
    archived: false,
    issueState: "OPEN",
    assignees: ["alice"],
    competitors: [] as object[],
  };
  const pr = {
    number: 50,
    state: "open",
    draft: true,
    body: "<!-- issue-ref:42 -->\nRefs #42",
    head: {
      ref: "feature/42-work",
      repo: { full_name: "engineer-first/idea-boost" },
    },
    requested_reviewers: [{ login: "bob" }],
    requested_teams: [],
  };
  const item = () => ({
    id: "item",
    project: { id: "project" },
    isArchived: state.archived,
    fieldValueByName: { name: state.status, updatedAt: state.stamp },
    automation: { text: state.record },
  });
  const github = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: vi
          .fn()
          .mockResolvedValue({ data: { permission } }),
      },
      pulls: { get: vi.fn(async () => ({ data: structuredClone(pr) })) },
    },
    graphql: vi.fn(async (query: string, vars: Record<string, unknown>) => {
      if (query.includes("ReviewProjectContext"))
        return {
          organization: {
            projectV2: {
              id: "project",
              fields: {
                nodes: [
                  {
                    id: "status",
                    name: "Status",
                    options: ["着手可能", "作業中", "レビュー中"].map(
                      (name) => ({ id: name, name }),
                    ),
                  },
                  { id: "record", name: "自動レビュー元", dataType: "TEXT" },
                ],
              },
            },
          },
        };
      if (query.includes("ReviewIssueContext"))
        return {
          repository: {
            issue: {
              id: "issue",
              number: 42,
              state: state.issueState,
              issueType: { name: state.type },
              subIssuesSummary: { total: state.children },
              assignees: { nodes: state.assignees.map((login) => ({ login })) },
              projectItems: { nodes: [item()] },
              timelineItems: {
                nodes: state.competitors,
                pageInfo: { hasNextPage: false },
              },
            },
          },
        };
      if (query.includes("UpdateIssueStatus")) {
        state.status = String(vars.optionId);
        state.stamp = `stamp-${state.changes.length + 1}`;
        state.changes.push(state.status);
        return { updateProjectV2ItemFieldValue: { projectV2Item: item() } };
      }
      if (query.includes("RecordReviewSource")) {
        state.record = String(vars.text);
        return {
          updateProjectV2ItemFieldValue: { projectV2Item: { id: "item" } },
        };
      }
      throw new Error(`Unexpected query: ${query}`);
    }),
  };
  const fire = (action: string, extra: Record<string, unknown> = {}) =>
    syncIssueProjectStatus({
      github,
      core: { info: vi.fn() },
      context: {
        repo: { owner: "engineer-first", repo: "idea-boost" },
        payload: {
          action,
          sender: { login: "alice" },
          ...(action === "assigned"
            ? { issue: { number: 42 }, assignee: { login: "alice" } }
            : {
                pull_request: structuredClone(pr),
                requested_reviewer: { login: "bob" },
              }),
          ...extra,
        },
      },
    });
  return { state, pr, github, fire };
}

describe("Issue 状態の操作連携", () => {
  it("同じ本文を繰り返し解析しても対応 Issue が変わらない", () => {
    for (let index = 0; index < 5; index++) {
      expect(parseIssueReference("<!-- issue-ref:42 -->")).toBe(42);
    }
  });
  it("Agent の同一リポジトリ Draft 作成だけを権限例外として扱う", async () => {
    const f = fixture({ permission: "read" });
    await f.fire("opened");
    expect(f.state.changes).toEqual(["作業中"]);
    f.pr.draft = false;
    await f.fire("review_requested");
    expect(f.state.changes).toEqual(["作業中"]);
    const fork = fixture({ permission: "read" });
    fork.pr.head.repo.full_name = "outsider/fork";
    await fork.fire("opened");
    expect(fork.state.changes).toEqual([]);
  });
  it.each([
    "Task",
    "Bug",
    "Spike",
  ])("%s の自己アサインで着手し、再実行では更新しない", async (type) => {
    const f = fixture({ type });
    expect((await f.fire("assigned")).updated).toBe(true);
    await f.fire("assigned");
    expect(f.state.changes).toEqual(["作業中"]);
  });
  it("他人への割当てと割当て解除後の遅延イベントでは開始しない", async () => {
    const f = fixture();
    await f.fire("assigned", { sender: { login: "bob" } });
    f.state.assignees = [];
    await f.fire("assigned");
    expect(f.state.changes).toEqual([]);
  });
  it.each([
    "未整理",
    "壁打ち中",
    "作業中",
    "レビュー中",
    "完了",
    "見送り",
  ])("自己アサインは %s を上書きしない", async (status) => {
    const f = fixture({ status });
    await f.fire("assigned");
    expect(f.state.changes).toEqual([]);
  });
  it.each([
    "PBI",
    "DemoGoal",
    "相談",
  ])("%s の担当者を開始とみなさない", async (type) => {
    const f = fixture({ type });
    await f.fire("assigned");
    expect(f.state.changes).toEqual([]);
  });
  it("番号付きブランチの Draft PR 作成はリンク追記を待たずに開始できる", async () => {
    const f = fixture();
    f.pr.body = "説明のみ";
    await f.fire("opened");
    expect(f.state.changes).toEqual(["作業中"]);
  });
  it("fork のブランチ名や壊れたマーカーから対象を推測しない", async () => {
    const f = fixture();
    f.pr.body = "説明のみ";
    f.pr.head.repo.full_name = "outsider/fork";
    await f.fire("opened");
    f.pr.head.repo.full_name = "engineer-first/idea-boost";
    f.pr.body = "<!-- issue-ref:invalid -->";
    await f.fire("opened");
    expect(f.state.changes).toEqual([]);
  });
  it("通常PR作成、Milestone設定、ブランチ作成、マージは状態を変えない", async () => {
    const f = fixture();
    f.pr.draft = false;
    for (const action of ["opened", "milestoned", "created", "closed"])
      await f.fire(action);
    expect(f.state.changes).toEqual([]);
  });
  it("レビュー依頼の記録が一致する場合だけ Draft に戻して作業中にする", async () => {
    const f = fixture({ status: "作業中" });
    f.pr.draft = false;
    await f.fire("review_requested");
    expect(f.state.status).toBe("レビュー中");
    expect(f.state.record).toContain("50");
    f.pr.draft = true;
    await f.fire("converted_to_draft");
    await f.fire("converted_to_draft");
    expect(f.state.changes).toEqual(["レビュー中", "作業中"]);
  });
  it("手動レビュー状態、手動変更後、別PRの記録では Draft 復帰で戻さない", async () => {
    const f = fixture({ status: "レビュー中" });
    await f.fire("converted_to_draft");
    expect(f.state.changes).toEqual([]);
    f.state.status = "作業中";
    f.pr.draft = false;
    await f.fire("review_requested");
    f.pr.draft = true;
    f.state.stamp = "manual-edit";
    await f.fire("converted_to_draft");
    expect(f.state.changes).toEqual(["レビュー中"]);
    f.state.stamp = JSON.parse(f.state.record).statusUpdatedAt;
    f.state.record = JSON.stringify({
      ...JSON.parse(f.state.record),
      pullNumber: 51,
    });
    await f.fire("converted_to_draft");
    expect(f.state.changes).toEqual(["レビュー中"]);
  });
  it("権限不足・閉じたIssue・子Issue・アーカイブでは更新しない", async () => {
    const denied = fixture({ permission: "read" });
    await denied.fire("assigned");
    expect(denied.state.changes).toEqual([]);
    for (const property of [
      { issueState: "CLOSED" },
      { children: 1 },
      { archived: true },
    ]) {
      const f = fixture();
      Object.assign(f.state, property);
      await f.fire("assigned");
      expect(f.state.changes).toEqual([]);
    }
  });
  it("複数の直接対応 PR がある場合は Draft 作成から進めない", async () => {
    const f = fixture();
    f.state.competitors = [
      {
        source: {
          number: 51,
          body: "<!-- issue-ref:42 -->",
          repository: { nameWithOwner: "engineer-first/idea-boost" },
        },
      },
    ];
    await f.fire("opened");
    expect(f.state.changes).toEqual([]);
  });
  it("更新直前に状態が変わっていたら手動変更を優先する", async () => {
    const f = fixture();
    const original = f.github.graphql.getMockImplementation();
    let reads = 0;
    f.github.graphql.mockImplementation(async (query, vars) => {
      if (query.includes("ReviewIssueContext") && ++reads === 2) {
        f.state.status = "壁打ち中";
        f.state.stamp = "manual";
      }
      return original?.(query, vars);
    });
    await f.fire("assigned");
    expect(f.state.changes).toEqual([]);
  });
  it("別の同一リポジトリ番号付き PR もリンク追記前から重複と判定する", async () => {
    const f = fixture();
    f.state.competitors = [
      {
        source: {
          number: 51,
          body: "説明のみ",
          headRefName: "feature/42-second",
          headRepository: { nameWithOwner: "engineer-first/idea-boost" },
          repository: { nameWithOwner: "engineer-first/idea-boost" },
        },
      },
    ];
    await f.fire("opened");
    expect(f.state.changes).toEqual([]);
  });
});

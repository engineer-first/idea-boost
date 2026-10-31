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
    stateReason: "COMPLETED" as string | null,
    assignees: ["alice"],
    competitors: [] as object[],
    closingIssueNumbers: [42],
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
    base: { ref: "develop" },
    requested_reviewers: [{ login: "bob" }],
    requested_teams: [],
    merged: false,
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
      if (query.includes("PullRequestClosingIssues"))
        return {
          repository: {
            pullRequest: {
              closingIssuesReferences: {
                nodes: state.closingIssueNumbers.map((number) => ({
                  number,
                  repository: { nameWithOwner: "engineer-first/idea-boost" },
                })),
              },
            },
          },
        };
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
                    options: [
                      "未整理",
                      "壁打ち中",
                      "着手可能",
                      "作業中",
                      "レビュー中",
                      "完了",
                      "見送り",
                    ].map((name) => ({ id: name, name })),
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
              stateReason: state.stateReason,
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
          repository: { default_branch: "develop" },
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
  it.each(["Task", "Bug", "PBI", "相談・要望"])(
    "%s の未整理への担当者追加で壁打ち中にし、再実行では更新しない",
    async (type) => {
      const f = fixture({ type, status: "未整理" });
      f.state.children = 2;
      expect(
        (await f.fire("assigned", { sender: { login: "bob" } })).updated,
      ).toBe(true);
      await f.fire("assigned");
      expect(f.state.changes).toEqual(["壁打ち中"]);
    },
  );
  it("割当て解除後の遅延イベントでは更新しない", async () => {
    const f = fixture({ status: "未整理" });
    f.state.assignees = [];
    await f.fire("assigned");
    expect(f.state.changes).toEqual([]);
  });
  it.each(["壁打ち中", "着手可能", "作業中", "レビュー中", "完了", "見送り"])(
    "担当者追加は %s を上書きしない",
    async (status) => {
      const f = fixture({ status });
      await f.fire("assigned");
      expect(f.state.changes).toEqual([]);
    },
  );
  it("Issue closeで種類や子の有無によらず完了にし、再実行では更新しない", async () => {
    const f = fixture({ type: "PBI", status: "壁打ち中" });
    f.state.issueState = "CLOSED";
    f.state.children = 2;
    const event = { issue: { number: 42 }, pull_request: undefined };
    expect((await f.fire("closed", event)).updated).toBe(true);
    await f.fire("closed", event);
    expect(f.state.changes).toEqual(["完了"]);
  });
  it("更新直前にclose理由が変わったら最新の理由で見送りにする", async () => {
    const f = fixture({ status: "作業中" });
    f.state.issueState = "CLOSED";
    const original = f.github.graphql.getMockImplementation();
    let reads = 0;
    f.github.graphql.mockImplementation(async (query, vars) => {
      if (query.includes("ReviewIssueContext") && ++reads === 2)
        f.state.stateReason = "NOT_PLANNED";
      return original?.(query, vars);
    });
    await f.fire("closed", { issue: { number: 42 }, pull_request: undefined });
    expect(f.state.changes).toEqual(["見送り"]);
  });
  it("close後にreopenされたIssueは遅延イベントで完了にしない", async () => {
    const f = fixture({ status: "作業中" });
    await f.fire("closed", { issue: { number: 42 }, pull_request: undefined });
    expect(f.state.changes).toEqual([]);
  });
  it("番号付きブランチの Draft PR 作成はリンク追記を待たずに開始できる", async () => {
    const f = fixture();
    f.pr.body = "説明のみ";
    await f.fire("opened");
    expect(f.state.changes).toEqual(["作業中"]);
  });
  it("Closesで対応Issueを閉じるPRのマージで完了にする", async () => {
    const f = fixture({ status: "レビュー中", permission: "read" });
    f.pr.state = "closed";
    f.pr.merged = true;
    f.state.issueState = "CLOSED";
    await f.fire("closed");
    expect(f.state.changes).toEqual(["完了"]);
    expect(
      f.github.rest.repos.getCollaboratorPermissionLevel,
    ).not.toHaveBeenCalled();
  });
  it("未マージ、default branch以外、closing referenceなしでは完了にしない", async () => {
    const unmerged = fixture({ status: "レビュー中" });
    unmerged.pr.state = "closed";
    unmerged.state.issueState = "CLOSED";
    await unmerged.fire("closed");
    const otherBase = fixture({ status: "レビュー中" });
    otherBase.pr.state = "closed";
    otherBase.state.issueState = "CLOSED";
    otherBase.pr.merged = true;
    otherBase.pr.base.ref = "release";
    await otherBase.fire("closed");
    const unrelated = fixture({ status: "レビュー中" });
    unrelated.pr.state = "closed";
    unrelated.state.issueState = "CLOSED";
    unrelated.pr.merged = true;
    unrelated.state.closingIssueNumbers = [43];
    await unrelated.fire("closed");
    expect(unmerged.state.changes).toEqual([]);
    expect(otherBase.state.changes).toEqual([]);
    expect(unrelated.state.changes).toEqual([]);
  });
  it("見送りをPRマージで完了へ上書きしない", async () => {
    const f = fixture({ status: "見送り" });
    f.state.issueState = "CLOSED";
    f.state.stateReason = "NOT_PLANNED";
    f.pr.state = "closed";
    f.pr.merged = true;
    await f.fire("closed");
    expect(f.state.changes).toEqual([]);
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
  it("Milestone設定、ブランチ作成、未マージcloseは状態を変えない", async () => {
    const f = fixture();
    f.pr.draft = false;
    for (const action of ["milestoned", "created", "closed"])
      await f.fire(action);
    expect(f.state.changes).toEqual([]);
  });
  it.each(["壁打ち中", "着手可能"])(
    "%s からDraft PRを作ると作業中にする",
    async (status) => {
      const f = fixture({ status });
      f.pr.body = "説明のみ";
      await f.fire("opened");
      await f.fire("opened");
      expect(f.state.changes).toEqual(["作業中"]);
    },
  );
  it.each(["opened", "ready_for_review"])(
    "%s はレビュー依頼なしでもレビュー中にする",
    async (action) => {
      for (const status of ["壁打ち中", "着手可能", "作業中"]) {
        const f = fixture({ status });
        f.pr.draft = false;
        f.pr.requested_reviewers = [];
        f.pr.body = "説明のみ";
        await f.fire(action, { requested_reviewer: undefined });
        await f.fire(action, { requested_reviewer: undefined });
        expect(f.state.changes).toEqual(["レビュー中"]);
        expect(f.state.record).toContain('"pullNumber":50');
        f.pr.draft = true;
        await f.fire("converted_to_draft");
        expect(f.state.changes).toEqual(["レビュー中", "作業中"]);
      }
    },
  );
  it.each(["未整理", "完了", "見送り"])(
    "%s はPR作成・Draft解除で上書きしない",
    async (status) => {
      for (const action of ["opened", "ready_for_review"]) {
        const f = fixture({ status });
        f.pr.draft = false;
        await f.fire(action);
        expect(f.state.changes).toEqual([]);
      }
    },
  );
  it.each(["NOT_PLANNED", "DUPLICATE"])(
    "close理由 %s は完了を見送りへ同期する",
    async (stateReason) => {
      const f = fixture({ status: "完了" });
      f.state.issueState = "CLOSED";
      f.state.stateReason = stateReason;
      const event = { issue: { number: 42 }, pull_request: undefined };
      await f.fire("closed", event);
      await f.fire("closed", event);
      expect(f.state.changes).toEqual(["見送り"]);
    },
  );
  it("close理由が不明なら完了・見送りを推測しない", async () => {
    const f = fixture();
    f.state.issueState = "CLOSED";
    f.state.stateReason = null;
    await f.fire("closed", { issue: { number: 42 }, pull_request: undefined });
    expect(f.state.changes).toEqual([]);
  });
  it.each(["完了", "見送り", "壁打ち中"])(
    "%s のIssueをreopenすると着手可能にし、重複実行では更新しない",
    async (status) => {
      const f = fixture({ status });
      f.state.stateReason = "REOPENED";
      const event = { issue: { number: 42 }, pull_request: undefined };
      await f.fire("reopened", event);
      await f.fire("reopened", event);
      expect(f.state.changes).toEqual(["着手可能"]);
    },
  );
  it("reopen後にcloseされたIssueは遅延イベントで戻さない", async () => {
    const f = fixture({ status: "完了" });
    f.state.issueState = "CLOSED";
    await f.fire("reopened", {
      issue: { number: 42 },
      pull_request: undefined,
    });
    expect(f.state.changes).toEqual([]);
  });
  it("PRマージ後にreopenしたIssueを遅延マージイベントで完了にしない", async () => {
    const f = fixture();
    f.state.stateReason = "REOPENED";
    f.pr.merged = true;
    f.pr.state = "closed";
    await f.fire("closed");
    expect(f.state.changes).toEqual([]);
  });
  it("Projectの自動closeやIssue作者のcloseも最新のclose理由で同期する", async () => {
    const f = fixture({ permission: "read", status: "作業中" });
    f.state.issueState = "CLOSED";
    await f.fire("closed", { issue: { number: 42 }, pull_request: undefined });
    expect(f.state.changes).toEqual(["完了"]);
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
  it("権限不足・閉じたIssue・アーカイブでは担当者追加で更新しない", async () => {
    const denied = fixture({ permission: "read", status: "未整理" });
    await denied.fire("assigned");
    expect(denied.state.changes).toEqual([]);
    for (const property of [{ issueState: "CLOSED" }, { archived: true }]) {
      const f = fixture({ status: "未整理" });
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
    const f = fixture({ status: "未整理" });
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

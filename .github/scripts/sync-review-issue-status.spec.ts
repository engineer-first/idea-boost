import { describe, expect, it, vi } from "vitest";
import {
  parseIssueReference,
  shouldMoveIssueToReview,
  syncReviewIssueStatus,
} from "./sync-review-issue-status.js";

const baseInput = {
  action: "review_requested",
  event: {
    requested_reviewer: { login: "reviewer-a" },
    requested_team: null,
  },
  pullRequest: {
    number: 50,
    state: "open",
    draft: false,
    body: "対応内容\n\n<!-- issue-ref:42 -->\nRefs #42",
    requested_reviewers: [{ login: "reviewer-a" }],
    requested_teams: [],
  },
  issue: {
    number: 42,
    state: "OPEN",
    type: "Task",
    subIssueCount: 0,
  },
  projectItem: {
    exists: true,
    archived: false,
    status: "作業中",
  },
  repository: "engineer-first/idea-boost",
  directPullRequests: [
    {
      number: 50,
      repository: "engineer-first/idea-boost",
      body: "対応内容\n\n<!-- issue-ref:42 -->\nRefs #42",
    },
  ],
};

describe("parseIssueReference", () => {
  it("1つの明示マーカーだけを対応Issueとして読む", () => {
    expect(parseIssueReference("Refs #8, #9\n<!-- issue-ref:42 -->")).toBe(42);
  });

  it("Issue番号への一般的な言及だけでは関連付けない", () => {
    expect(parseIssueReference("Refs #42 and closes #43")).toBeNull();
  });

  it("複数または不正なマーカーは曖昧として扱う", () => {
    expect(
      parseIssueReference("<!-- issue-ref:42 -->\n<!-- issue-ref:43 -->"),
    ).toBeNull();
    expect(parseIssueReference("<!-- issue-ref:abc -->")).toBeNull();
    expect(
      parseIssueReference("<!-- issue-ref:42 --><!-- issue-ref:abc -->"),
    ).toBeNull();
  });
});

describe("shouldMoveIssueToReview", () => {
  it("人へのレビュー依頼で直接対応するIssueをレビュー中へ進める", () => {
    expect(shouldMoveIssueToReview(baseInput).allowed).toBe(true);
  });

  it("チームへのレビュー依頼も扱う", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        event: {
          requested_reviewer: null,
          requested_team: { slug: "review-team" },
        },
        pullRequest: {
          ...baseInput.pullRequest,
          requested_reviewers: [],
          requested_teams: [{ slug: "review-team" }],
        },
      }).allowed,
    ).toBe(true);
  });

  it("イベントのレビュー対象が最新PRの未処理依頼に含まれない場合は見送る", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        event: {
          requested_reviewer: { login: "former-reviewer" },
          requested_team: null,
        },
      }).allowed,
    ).toBe(false);
  });

  it("レビュー依頼イベントに対象者がない場合は見送る", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        event: { requested_reviewer: null, requested_team: null },
      }).allowed,
    ).toBe(false);
  });

  it("同じIssueへの再依頼で作業中からレビュー中へ戻せる", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        event: {
          requested_reviewer: { login: "reviewer-b" },
          requested_team: null,
        },
        pullRequest: {
          ...baseInput.pullRequest,
          requested_reviewers: [{ login: "reviewer-b" }],
        },
      }).allowed,
    ).toBe(true);
  });

  it("担当者の割り当てだけやレビュー依頼取り消しでは動かさない", () => {
    expect(
      shouldMoveIssueToReview({ ...baseInput, action: "assigned" }).allowed,
    ).toBe(false);
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        action: "review_request_removed",
      }).allowed,
    ).toBe(false);
  });

  it("Draft解除時も実際にレビュー依頼が残っている場合だけ扱う", () => {
    const ready = {
      ...baseInput,
      action: "ready_for_review",
      event: { requested_reviewer: null, requested_team: null },
    };
    expect(shouldMoveIssueToReview(ready).allowed).toBe(true);
    expect(
      shouldMoveIssueToReview({
        ...ready,
        pullRequest: { ...ready.pullRequest, requested_reviewers: [] },
      }).allowed,
    ).toBe(false);
  });

  it("閉じたPRとDraft PRは進めない", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        pullRequest: { ...baseInput.pullRequest, state: "closed" },
      }).allowed,
    ).toBe(false);
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        pullRequest: { ...baseInput.pullRequest, draft: true },
      }).allowed,
    ).toBe(false);
  });

  it("明示的なIssue参照がないPRは無関係な番号を読まずに見送る", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        pullRequest: { ...baseInput.pullRequest, body: "Refs #42" },
      }).allowed,
    ).toBe(false);
  });

  it("PRの明示参照と対象Issue番号が一致しない場合は見送る", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        pullRequest: {
          ...baseInput.pullRequest,
          body: "<!-- issue-ref:43 -->",
        },
      }).allowed,
    ).toBe(false);
  });

  it("子IssueのPRから親PBIやDemoGoalを更新しない", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        issue: { ...baseInput.issue, type: "PBI", subIssueCount: 1 },
      }).allowed,
    ).toBe(false);
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        issue: { ...baseInput.issue, type: "DemoGoal" },
      }).allowed,
    ).toBe(false);
  });

  it("子を持たない直接実装PBIは対象にできる", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        issue: { ...baseInput.issue, type: "PBI", subIssueCount: 0 },
      }).allowed,
    ).toBe(true);
  });

  it("複数PRで進めるIssueは1つのPRの依頼だけでは更新しない", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        directPullRequests: [
          ...baseInput.directPullRequests,
          {
            number: 51,
            repository: "engineer-first/idea-boost",
            body: "<!-- issue-ref:42 -->\nRefs #42",
          },
        ],
      }).allowed,
    ).toBe(false);
  });

  it("別PRのissue-refが曖昧な場合も安全側で更新しない", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        directPullRequests: [
          ...baseInput.directPullRequests,
          {
            number: 51,
            repository: "engineer-first/idea-boost",
            body: "<!-- issue-ref:42 -->\n<!-- issue-ref:43 -->",
          },
        ],
      }),
    ).toEqual({
      allowed: false,
      reason: "ambiguous-direct-pull-request-reference",
    });
  });

  it("重複イベントはレビュー中の状態を再更新しない", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        projectItem: { ...baseInput.projectItem, status: "レビュー中" },
      }).allowed,
    ).toBe(false);
  });

  it.each([
    "未整理",
    "壁打ち中",
    "着手可能",
    "完了",
    "見送り",
  ])("%s をレビュー依頼で上書きしない", (status) => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        projectItem: { ...baseInput.projectItem, status },
      }).allowed,
    ).toBe(false);
  });

  it("閉じたIssue、Project未登録、アーカイブ済みIssue、Project権限不足は成功扱いにしない", () => {
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        issue: { ...baseInput.issue, state: "CLOSED" },
      }).allowed,
    ).toBe(false);
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        projectItem: { ...baseInput.projectItem, exists: false },
      }).allowed,
    ).toBe(false);
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        projectItem: { ...baseInput.projectItem, archived: true },
      }).allowed,
    ).toBe(false);
    expect(
      shouldMoveIssueToReview({
        ...baseInput,
        projectItem: { ...baseInput.projectItem, status: null },
      }).allowed,
    ).toBe(false);
  });
});

describe("syncReviewIssueStatus", () => {
  const context = {
    repo: { owner: "engineer-first", repo: "idea-boost" },
    payload: {
      action: "review_requested",
      requested_reviewer: { login: "reviewer-a" },
      requested_team: null,
      pull_request: { number: 50 },
    },
  };

  function makeGithub({ projectError = false } = {}) {
    const graphql = vi.fn(async (query: string) => {
      if (query.includes("ReviewProjectContext")) {
        if (projectError)
          throw new Error("Resource not accessible by integration");
        return {
          organization: {
            projectV2: {
              id: "project-3",
              fields: {
                nodes: [
                  {
                    id: "status-field",
                    name: "Status",
                    options: [{ id: "review-option", name: "レビュー中" }],
                  },
                ],
              },
            },
          },
        };
      }
      if (query.includes("ReviewIssueContext")) {
        return {
          repository: {
            issue: {
              id: "issue-42",
              number: 42,
              state: "OPEN",
              issueType: { name: "Task" },
              subIssuesSummary: { total: 0 },
              projectItems: {
                nodes: [
                  {
                    id: "project-item-42",
                    isArchived: false,
                    project: { id: "project-3" },
                    fieldValueByName: { name: "作業中" },
                  },
                ],
              },
              timelineItems: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        };
      }
      return {
        updateProjectV2ItemFieldValue: {
          projectV2Item: { id: "project-item-42" },
        },
      };
    });
    return {
      graphql,
      rest: {
        pulls: {
          get: vi.fn().mockResolvedValue({
            data: {
              number: 50,
              state: "open",
              draft: false,
              body: "<!-- issue-ref:42 -->\nRefs #42",
              requested_reviewers: [{ login: "reviewer-a" }],
              requested_teams: [],
            },
          }),
        },
      },
    };
  }

  it("Projectの直接リンクIssueだけをレビュー中へ更新する", async () => {
    const github = makeGithub();
    const core = { info: vi.fn() };

    const result = await syncReviewIssueStatus({ github, context, core });

    expect(result).toEqual({ updated: true, issueNumber: 42 });
    expect(github.graphql).toHaveBeenCalledTimes(3);
    expect(github.graphql.mock.calls[2]?.[1]).toEqual({
      projectId: "project-3",
      itemId: "project-item-42",
      fieldId: "status-field",
      optionId: "review-option",
    });
  });

  it("Project権限エラーは成功扱いせず呼び出し元へ返す", async () => {
    const github = makeGithub({ projectError: true });

    await expect(
      syncReviewIssueStatus({ github, context, core: { info: vi.fn() } }),
    ).rejects.toThrow("Resource not accessible by integration");
    expect(github.graphql).toHaveBeenCalledTimes(1);
  });
});

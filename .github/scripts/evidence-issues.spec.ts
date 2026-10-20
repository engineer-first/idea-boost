import { describe, expect, it, vi } from "vitest";
import { syncEvidenceIssue } from "./sync-evidence-issue.js";

function fixture(type = "フィードバック") {
  const get = vi.fn(async () => ({
    data: {
      number: 42,
      node_id: "ISSUE",
      state: "open",
      type: { name: type },
      milestone: { number: 9 },
    },
  }));
  const update = vi.fn(async () => ({}));
  const graphql = vi.fn(async (query: string) => {
    if (query.includes("EvidenceItems"))
      return {
        node: {
          projectItems: {
            nodes: [
              {
                id: "WORK_ITEM",
                isArchived: false,
                project: { id: "PVT_kwDOEYcVLM4Bb8yF" },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      };
    if (query.includes("AddEvidence"))
      return { addProjectV2ItemById: { item: { id: "RECORD_ITEM" } } };
    if (query.includes("EvidenceFields"))
      return {
        node: {
          fields: {
            nodes: [
              {
                id: "REVIEW",
                name: "確認状態",
                options: [{ id: "UNREVIEWED", name: "未確認" }],
              },
            ],
          },
        },
      };
    return {};
  });
  return {
    github: { graphql },
    issuesGithub: { rest: { issues: { get, update } } },
    owner: "engineer-first",
    repo: "idea-boost",
    issueNumber: 42,
    dryRun: false,
  };
}

describe("蓄積Issueの振り分け", () => {
  it.each(["競合調査", "フィードバック", "成果データ"])(
    "%sはMilestoneを外し、蓄積Projectへ追加して作業Projectの記録を保管する",
    async (type) => {
      const input = fixture(type);
      const result = await syncEvidenceIssue(input);
      expect(result.updated).toBe(true);
      expect(input.issuesGithub.rest.issues.update).toHaveBeenCalledWith({
        owner: input.owner,
        repo: input.repo,
        issue_number: 42,
        milestone: null,
      });
      expect(input.github.graphql).toHaveBeenCalledWith(
        expect.stringContaining("AddEvidence"),
        expect.objectContaining({
          projectId: "PVT_kwDOEYcVLM4Bn1YA",
          contentId: "ISSUE",
        }),
      );
      expect(input.github.graphql).toHaveBeenCalledWith(
        expect.stringContaining("ArchiveWork"),
        expect.objectContaining({ itemId: "WORK_ITEM" }),
      );
    },
  );
  it.each(["Task", "Bug", "PBI", "Spike", "相談・要望", ""])(
    "作業Type %sや未設定のIssueは一切変更しない",
    async (type) => {
      const input = fixture(type);
      expect((await syncEvidenceIssue(input)).updated).toBe(false);
      expect(input.issuesGithub.rest.issues.update).not.toHaveBeenCalled();
      expect(input.github.graphql).not.toHaveBeenCalled();
    },
  );
  it("再実行では確認状態を上書きせず、蓄積Projectへ二重追加しない", async () => {
    const input = fixture();
    input.issuesGithub.rest.issues.get.mockResolvedValue({
      data: {
        number: 42,
        node_id: "ISSUE",
        state: "open",
        type: { name: "フィードバック" },
        milestone: null,
      },
    } as never);
    input.github.graphql.mockResolvedValue({
      node: {
        projectItems: {
          nodes: [
            {
              id: "RECORD_ITEM",
              project: { id: "PVT_kwDOEYcVLM4Bn1YA" },
              isArchived: false,
              review: { name: "確認済み" },
            },
          ],
          pageInfo: { hasNextPage: false },
        },
      },
    });
    expect((await syncEvidenceIssue(input)).updated).toBe(false);
    expect(input.issuesGithub.rest.issues.update).not.toHaveBeenCalled();
    expect(
      input.github.graphql.mock.calls.every(([q]) => !q.includes("mutation")),
    ).toBe(true);
  });
  it("dry-runはMilestoneもProjectも更新しない", async () => {
    const input = fixture();
    await syncEvidenceIssue({ ...input, dryRun: true });
    expect(input.issuesGithub.rest.issues.update).not.toHaveBeenCalled();
    expect(
      input.github.graphql.mock.calls.every(([q]) => !q.includes("mutation")),
    ).toBe(true);
  });
  it("更新前に作業Typeへ変更された場合は更新を止める", async () => {
    const input = fixture();
    input.issuesGithub.rest.issues.get
      .mockResolvedValueOnce({
        data: {
          number: 42,
          node_id: "ISSUE",
          state: "open",
          type: { name: "フィードバック" },
          milestone: { number: 9 },
        },
      })
      .mockResolvedValue({
        data: {
          number: 42,
          node_id: "ISSUE",
          state: "open",
          type: { name: "Task" },
          milestone: { number: 9 },
        },
      });
    await syncEvidenceIssue(input);
    expect(input.issuesGithub.rest.issues.update).not.toHaveBeenCalled();
    expect(
      input.github.graphql.mock.calls.every(([q]) => !q.includes("mutation")),
    ).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { closeProjectIssues } from "./close-project-issues.js";

function fixture() {
  const item = {
    id: "item-42",
    isArchived: false,
    project: { id: "project-3" },
    fieldValueByName: { name: "見送り", updatedAt: "2026-10-31T03:00:00Z" },
    content: {
      __typename: "Issue",
      id: "issue-42",
      number: 42,
      state: "OPEN",
      updatedAt: "2026-10-30T03:00:00Z",
      repository: { nameWithOwner: "engineer-first/idea-boost" },
    },
  };
  const graphql = vi.fn(async (query: string) => {
    if (query.includes("ProjectIssueCloseCandidates"))
      return {
        organization: {
          projectV2: {
            id: "project-3",
            items: {
              nodes: [structuredClone(item)],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      };
    return { node: structuredClone(item) };
  });
  const get = vi.fn(async () => ({
    data: { state: "open", updated_at: item.content.updatedAt },
  }));
  const update = vi.fn().mockResolvedValue({});
  const run = (dryRun = false) =>
    closeProjectIssues({
      projectGithub: { graphql },
      github: { rest: { issues: { get, update } } },
      owner: "engineer-first",
      repo: "idea-boost",
      dryRun,
    });
  return { item, graphql, get, update, run };
}

describe("Projectsの完了・見送りからIssueを閉じる", () => {
  it.each([
    ["見送り", "not_planned"],
    ["完了", "completed"],
  ])("%s のopen Issueを %s として閉じる", async (status, reason) => {
    const f = fixture();
    f.item.fieldValueByName.name = status;
    await f.run();
    expect(f.update).toHaveBeenCalledExactlyOnceWith({
      owner: "engineer-first",
      repo: "idea-boost",
      issue_number: 42,
      state: "closed",
      state_reason: reason,
    });
  });
  it("dry-runは予定を返し、Issueを変更しない", async () => {
    const f = fixture();
    expect((await f.run(true)).planned).toEqual([
      { number: 42, status: "見送り", reason: "not_planned" },
    ]);
    expect(f.update).not.toHaveBeenCalled();
  });
  it.each(["未整理", "壁打ち中", "着手可能", "作業中", "レビュー中"])(
    "%s は閉じない",
    async (status) => {
      const f = fixture();
      f.item.fieldValueByName.name = status;
      await f.run();
      expect(f.update).not.toHaveBeenCalled();
    },
  );
  it.each(["archived", "closed", "foreign", "pr", "draft"])(
    "%s の項目は閉じない",
    async (kind) => {
      const f = fixture();
      if (kind === "archived") f.item.isArchived = true;
      if (kind === "closed") f.item.content.state = "CLOSED";
      if (kind === "foreign")
        f.item.content.repository.nameWithOwner = "other/repo";
      if (kind === "pr") f.item.content.__typename = "PullRequest";
      if (kind === "draft") f.item.content.__typename = "DraftIssue";
      await f.run();
      expect(f.update).not.toHaveBeenCalled();
    },
  );
  it("更新直前のStatus変更を優先する", async () => {
    const f = fixture();
    const original = f.graphql.getMockImplementation();
    f.graphql.mockImplementation(async (query) => {
      if (query.includes("ProjectIssueCloseRecheck")) {
        f.item.fieldValueByName.name = "作業中";
        f.item.fieldValueByName.updatedAt = "2026-10-31T04:00:00Z";
      }
      return original?.(query);
    });
    await f.run();
    expect(f.update).not.toHaveBeenCalled();
  });
  it("Statusより後に更新・reopenされたIssueを再度閉じない", async () => {
    const f = fixture();
    f.item.content.updatedAt = "2026-10-31T04:00:00Z";
    await f.run();
    expect(f.update).not.toHaveBeenCalled();
  });
  it("最終読取でclosedならclose理由を上書きしない", async () => {
    const f = fixture();
    f.get.mockResolvedValue({
      data: { state: "closed", updated_at: f.item.content.updatedAt },
    });
    await f.run();
    expect(f.update).not.toHaveBeenCalled();
  });
  it("最終読取までにIssueが更新された場合は見送る", async () => {
    const f = fixture();
    f.get.mockResolvedValue({
      data: { state: "open", updated_at: "2026-10-31T04:00:00Z" },
    });
    await f.run();
    expect(f.update).not.toHaveBeenCalled();
  });
  it("全ページを読んで重複Issueを1回だけ閉じる", async () => {
    const f = fixture();
    let pages = 0;
    const original = f.graphql.getMockImplementation();
    f.graphql.mockImplementation(async (query) => {
      const result = await original?.(query);
      if (
        query.includes("ProjectIssueCloseCandidates") &&
        result?.organization
      ) {
        result.organization.projectV2.items.pageInfo = {
          hasNextPage: ++pages === 1,
        };
        Object.assign(result.organization.projectV2.items.pageInfo, {
          endCursor: "page-2",
        });
      }
      return result;
    });
    await f.run();
    expect(pages).toBe(2);
    expect(f.update).toHaveBeenCalledTimes(1);
  });
  it("Projectの読取失敗・Issue更新失敗を成功にしない", async () => {
    const f = fixture();
    f.graphql.mockRejectedValueOnce(new Error("project denied"));
    await expect(f.run()).rejects.toThrow("project denied");
    expect(f.update).not.toHaveBeenCalled();
    f.update.mockRejectedValueOnce(new Error("close denied"));
    await expect(f.run()).rejects.toThrow("close denied");
  });
});

describe("状態同期workflowの接続", () => {
  it("Project読取を別Octokitインスタンスに分け、更新用tokenを上書きしない", async () => {
    const workflow = parse(
      readFileSync(".github/workflows/close-project-issues.yml", "utf8"),
    );
    const step = workflow.jobs.close.steps.find(
      (step: { with?: { script?: string } }) =>
        step.with?.script?.includes("closeProjectIssues"),
    );
    const close = vi.fn().mockResolvedValue({ planned: [], skipped: [] });
    const graphql = vi.fn();
    const ProjectClient = vi.fn(
      class {
        readonly graphql = graphql;
      },
    );
    const github = { constructor: ProjectClient };
    const summary = {
      addHeading: vi.fn().mockReturnThis(),
      addTable: vi.fn().mockReturnThis(),
      addRaw: vi.fn().mockReturnThis(),
      write: vi.fn(),
    };
    const execute = new Function(
      "github",
      "context",
      "core",
      "require",
      "process",
      `return (async () => { ${step.with.script} })()`,
    );
    await execute(
      github,
      { repo: { owner: "engineer-first", repo: "idea-boost" } },
      { info: vi.fn(), summary },
      () => ({ closeProjectIssues: close }),
      { env: { PROJECT_TOKEN: "project-reader", DRY_RUN: "true" } },
    );
    expect(ProjectClient).toHaveBeenCalledWith({ auth: "project-reader" });
    expect(close).toHaveBeenCalledWith({
      projectGithub: { graphql },
      github,
      owner: "engineer-first",
      repo: "idea-boost",
      dryRun: true,
    });
  });
  it("5分間隔・default branch限定・既定dry-runの手動実行でclose処理を呼ぶ", () => {
    const workflow = parse(
      readFileSync(".github/workflows/close-project-issues.yml", "utf8"),
    );
    expect(workflow.on.schedule).toEqual([{ cron: "*/5 * * * *" }]);
    expect(workflow.on.workflow_dispatch.inputs.dry_run.default).toBe(true);
    expect(workflow.jobs.close.if).toContain("repository.default_branch");
    expect(workflow.jobs.close.permissions.issues).toBe("write");
    expect(
      workflow.jobs.close.steps.find((step: { with?: { script?: string } }) =>
        step.with?.script?.includes("closeProjectIssues"),
      ),
    ).toBeDefined();
  });
});

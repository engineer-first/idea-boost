import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { planPriorityUpdates, syncPbiPriority } from "./sync-pbi-priority.js";

const item = (number: number, priority: number | null = null) => ({
  id: `item-${number}`,
  isArchived: false,
  priority: priority === null ? null : { number: priority },
  content: {
    __typename: "Issue",
    number,
    state: "OPEN",
    repository: { nameWithOwner: "engineer-first/idea-boost" },
    issueType: { name: "PBI" },
    parent: null,
  },
});
const snapshot = (items = [item(2, 2), item(1, 1)]) => ({
  id: "project",
  field: { id: "priority", name: "優先順位", dataType: "NUMBER" },
  view: {
    filter: "repo:engineer-first/idea-boost is:issue type:PBI is:open",
    sortByFields: { totalCount: 0 },
    groupByFields: { totalCount: 0 },
  },
  items: {
    nodes: items,
    pageInfo: { hasNextPage: false, endCursor: null as string | null },
  },
});
const page = (value: ReturnType<typeof snapshot>) => ({
  organization: { projectV2: value },
});

describe("PBIの優先順位同期", () => {
  it("手動の並び順を1から連番にし、数字が同じ項目は更新しない", () => {
    expect(
      planPriorityUpdates(
        [item(9, 1), item(2, 8), item(3)],
        "engineer-first/idea-boost",
      ),
    ).toEqual([
      { itemId: "item-2", number: 2, from: 8, to: 2 },
      { itemId: "item-3", number: 3, from: null, to: 3 },
    ]);
  });
  it("サブIssue・closed・別repo・別Type・archiveを連番から除く", () => {
    const child = {
      ...item(4),
      content: { ...item(4).content, parent: { id: "parent" } },
    };
    const closed = {
      ...item(5),
      content: { ...item(5).content, state: "CLOSED" },
    };
    const other = {
      ...item(6),
      content: {
        ...item(6).content,
        repository: { nameWithOwner: "other/repo" },
      },
    };
    const task = {
      ...item(7),
      content: { ...item(7).content, issueType: { name: "Task" } },
    };
    expect(
      planPriorityUpdates(
        [
          child,
          closed,
          other,
          task,
          { ...item(8), isArchived: true },
          item(10),
        ],
        "engineer-first/idea-boost",
      ),
    ).toEqual([{ itemId: "item-10", number: 10, from: null, to: 1 }]);
  });
  it("全ページ取得後に更新しdry-runでは書き込まない", async () => {
    const first = snapshot([item(2, 2)]);
    first.items.pageInfo = { hasNextPage: true, endCursor: "next" };
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(page(first))
      .mockResolvedValueOnce(page(snapshot([item(1, 1)])));
    const result = await syncPbiPriority({ graphql, dryRun: true });
    expect(result.planned.map((x: { number: number }) => x.number)).toEqual([
      2, 1,
    ]);
    expect(graphql).toHaveBeenCalledTimes(2);
    expect(graphql.mock.calls[1][1]).toMatchObject({ after: "next" });
  });
  it("再読取で順序が変われば書き込み前に停止する", async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(page(snapshot()))
      .mockResolvedValueOnce(page(snapshot([item(1, 1), item(2, 2)])));
    await expect(syncPbiPriority({ graphql, dryRun: false })).rejects.toThrow(
      /changed/,
    );
    expect(graphql).toHaveBeenCalledTimes(2);
  });
  it.each(["filter", "sort", "field"])(
    "%sの設定が対象と異なれば書き込まない",
    async (setting) => {
      const value = snapshot();
      if (setting === "filter") value.view.filter += " milestone:Sprint9";
      if (setting === "sort") value.view.sortByFields.totalCount = 1;
      if (setting === "field") value.field.dataType = "TEXT";
      const graphql = vi.fn().mockResolvedValue(page(value));
      await expect(
        syncPbiPriority({ graphql, dryRun: false }),
      ).rejects.toThrow();
      expect(graphql).toHaveBeenCalledTimes(1);
    },
  );
  it("変更を再確認して数字を更新し、結果を読取り検証する", async () => {
    const before = snapshot();
    const after = snapshot([item(2, 1), item(1, 2)]);
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(page(before))
      .mockResolvedValueOnce(page(before))
      .mockResolvedValueOnce({
        updateProjectV2ItemFieldValue: { projectV2Item: { id: "item-2" } },
      })
      .mockResolvedValueOnce({
        updateProjectV2ItemFieldValue: { projectV2Item: { id: "item-1" } },
      })
      .mockResolvedValueOnce(page(after));
    const result = await syncPbiPriority({ graphql, dryRun: false });
    expect(result.updated).toBe(2);
    expect(graphql.mock.calls[2][1]).toMatchObject({
      projectId: "project",
      itemId: "item-2",
      fieldId: "priority",
      priority: 1,
    });
  });
});

it("優先順位同期は5分ごとと手動実行に限定し、既存Appを使う", () => {
  const workflow = parse(
    readFileSync(".github/workflows/sync-pbi-priority.yml", "utf8"),
  );
  expect(workflow.on.schedule).toEqual([{ cron: "*/5 * * * *" }]);
  expect(Object.keys(workflow.on).sort()).toEqual([
    "schedule",
    "workflow_dispatch",
  ]);
  expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  const token = workflow.jobs.sync.steps.find(
    (step: { id?: string }) => step.id === "project-token",
  );
  expect(token.with["permission-organization-projects"]).toBe("write");
  expect(token.with["permission-issues"]).toBe("read");
  const sync = workflow.jobs.sync.steps.at(-1);
  expect(sync.env.DRY_RUN).toContain(
    "github.event_name == 'workflow_dispatch' && inputs.dry_run || false",
  );
});

it("途中のページのAPIエラーでは番号を一つも更新しない", async () => {
  const first = snapshot([item(2, 2)]);
  first.items.pageInfo = { hasNextPage: true, endCursor: "next" };
  const graphql = vi
    .fn()
    .mockResolvedValueOnce(page(first))
    .mockRejectedValueOnce(new Error("API unavailable"));
  await expect(syncPbiPriority({ graphql, dryRun: false })).rejects.toThrow(
    "API unavailable",
  );
  expect(graphql).toHaveBeenCalledTimes(2);
});

it("更新APIの失敗を成功扱いせず後続の更新を止める", async () => {
  const graphql = vi
    .fn()
    .mockResolvedValueOnce(page(snapshot()))
    .mockResolvedValueOnce(page(snapshot()))
    .mockRejectedValueOnce(new Error("rate limited"));
  await expect(syncPbiPriority({ graphql, dryRun: false })).rejects.toThrow(
    "rate limited",
  );
  expect(graphql).toHaveBeenCalledTimes(3);
});

it("更新後の読み取りで数字が反映されていなければ失敗する", async () => {
  const graphql = vi
    .fn()
    .mockResolvedValueOnce(page(snapshot()))
    .mockResolvedValueOnce(page(snapshot()))
    .mockResolvedValueOnce({
      updateProjectV2ItemFieldValue: { projectV2Item: { id: "item-2" } },
    })
    .mockResolvedValueOnce({
      updateProjectV2ItemFieldValue: { projectV2Item: { id: "item-1" } },
    })
    .mockResolvedValueOnce(page(snapshot()));
  await expect(syncPbiPriority({ graphql, dryRun: false })).rejects.toThrow(
    /verification failed/,
  );
});

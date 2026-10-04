import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
  assignCurrentSprint,
  resolveCurrentSprint,
} from "./assign-current-sprint.js";

const period = (start = "2026-10-05") =>
  `成果の説明\n<!-- idea-boost-sprint:v2\n${JSON.stringify({ schema_version: 2, timezone: "Asia/Tokyo", assignment_start_date: start })}\n-->`;
const milestone = (
  number = 7,
  start = "2026-10-05",
  due: string | null = "2026-10-14T00:00:00Z",
) => ({
  number,
  title: `Sprint ${number}`,
  state: "open",
  description: period(start),
  due_on: due,
});
const now = () => new Date("2026-10-08T03:00:00Z");
interface Issue {
  number: number;
  state: string;
  milestone: { number: number } | null;
  type?: { name: string } | null;
  pull_request?: { url: string };
}
const issue = (number = 42, assigned: number | null = null): Issue => ({
  number,
  state: "open",
  milestone: assigned ? { number: assigned } : null,
});
function fixture(issues = [issue()], milestones = [milestone()]) {
  const listMilestones = vi.fn();
  const listForRepo = vi.fn();
  const findIssue = (number: number) => {
    const found = issues.find((x) => x.number === number);
    if (!found) throw new Error(`Issue ${number} not found`);
    return found;
  };
  const get = vi.fn(async (input: { issue_number: number }) => ({
    data: findIssue(input.issue_number),
  }));
  const update = vi.fn(
    async (input: { issue_number: number; milestone: number }) => {
      const target = findIssue(input.issue_number);
      target.milestone = { number: input.milestone };
    },
  );
  const paginate = vi.fn(async (method: unknown) =>
    method === listMilestones ? milestones : issues,
  );
  return {
    github: {
      paginate,
      rest: { issues: { listMilestones, listForRepo, get, update } },
    },
    now,
    owner: "engineer-first",
    repo: "idea-boost",
    dryRun: false,
  };
}

describe("MilestoneのJST割当期間を使う", () => {
  it.each([
    ["2026-10-04T14:59:59.999Z", null],
    ["2026-10-04T15:00:00.000Z", 7],
    ["2026-10-13T14:59:59.999Z", 7],
    ["2026-10-13T15:00:00.000Z", 8],
    ["2026-10-21T14:59:59.999Z", 8],
    ["2026-10-21T15:00:00.000Z", 9],
  ])("review/demo日の00:00から次へ切り替わる %s", (instant, expected) => {
    const all = [
      milestone(),
      milestone(8, "2026-10-14", "2026-10-22T00:00:00Z"),
      milestone(9, "2026-10-22", "2026-11-02T00:00:00Z"),
    ];
    expect(
      resolveCurrentSprint(all, new Date(instant)).milestone?.number ?? null,
    ).toBe(expected);
  });
  it("titleや説明文だけでは推測しない", () => {
    expect(
      resolveCurrentSprint(
        [{ ...milestone(), description: "review/demoあり" }],
        now(),
      ).milestone,
    ).toBeNull();
  });
  it("due_onの変更を反映し、metadataに終了日を複製しない", () => {
    const instant = new Date("2026-10-13T15:00:00Z");
    expect(resolveCurrentSprint([milestone()], instant).milestone).toBeNull();
    expect(
      resolveCurrentSprint(
        [milestone(7, "2026-10-05", "2026-10-15T00:00:00Z")],
        instant,
      ).milestone?.number,
    ).toBe(7);
  });
  it("due_onはJSTの日付で解釈する", () => {
    const m = milestone(7, "2026-10-05", "2026-10-13T15:00:00Z");
    expect(
      resolveCurrentSprint([m], new Date("2026-10-13T14:59:59Z")).milestone
        ?.number,
    ).toBe(7);
    expect(
      resolveCurrentSprint([m], new Date("2026-10-13T15:00:00Z")).milestone,
    ).toBeNull();
  });
  it("該当なし・closed・重複はskipする", () => {
    expect(resolveCurrentSprint([], now()).reason).toBe("no-current-sprint");
    expect(
      resolveCurrentSprint([{ ...milestone(), state: "closed" }], now()).reason,
    ).toBe("current-sprint-closed");
    expect(
      resolveCurrentSprint([milestone(), milestone(8)], now()).reason,
    ).toBe("ambiguous-current-sprint");
  });
  it.each([
    period("2026-02-30"),
    `${period()}\n${period()}`,
    period().replace("Asia/Tokyo", "UTC"),
    "<!-- idea-boost-sprint:v2 {broken} -->",
    "<!-- idea-boost-sprint:v1 {} -->",
  ])("不正・重複・旧schemaを推測しない", (description) => {
    expect(
      resolveCurrentSprint([{ ...milestone(), description }], now()).reason,
    ).toBe("invalid-sprint-period");
  });
  it.each([
    "2026-02-30T00:00:00Z",
    "invalid",
    "2026-10-05T00:00:00Z",
  ])("不正due・開始日以前のdueを使わない %s", (due) => {
    expect(
      resolveCurrentSprint([milestone(7, "2026-10-05", due)], now()).reason,
    ).toBe("invalid-sprint-period");
  });
  it("後続未登録ならreview/demo日からskipし、次を捏造しない", () => {
    expect(
      resolveCurrentSprint(
        [milestone(14, "2026-12-11", "2027-01-08T00:00:00Z")],
        new Date("2027-01-07T15:00:00Z"),
      ).reason,
    ).toBe("no-current-sprint");
  });
  it("明示登録した後続はdue未確定でも使い、年を跨いで切り替える", () => {
    const all = [
      milestone(14, "2026-12-11", "2027-01-08T00:00:00Z"),
      milestone(15, "2027-01-08", null),
    ];
    expect(
      resolveCurrentSprint(all, new Date("2027-01-07T14:59:59Z")).milestone
        ?.number,
    ).toBe(14);
    expect(
      resolveCurrentSprint(all, new Date("2027-01-07T15:00:00Z")).milestone
        ?.number,
    ).toBe(15);
    expect(all[1].due_on).toBeNull();
  });
});

describe("全open Issueを現在sprintへ付け替える", () => {
  it.each([
    "Task",
    "Bug",
    "Spike",
    "PBI",
    "DemoGoal",
    "相談・要望",
    "Feature",
    null,
  ])("%sも親・Project状態に関係なく付与する", async (type) => {
    const input = fixture([{ ...issue(), type: type ? { name: type } : null }]);
    const result = await assignCurrentSprint(input);
    expect(result.updated).toEqual([{ number: 42, from: null, to: 7 }]);
    expect(input.github.rest.issues.update).toHaveBeenCalledWith({
      owner: "engineer-first",
      repo: "idea-boost",
      issue_number: 42,
      milestone: 7,
    });
  });
  it.each([
    6, 8, 99,
  ])("以前・将来・非sprintの割当#%sも現在sprintへ移す", async (assigned) => {
    const input = fixture([issue(42, assigned)]);
    expect((await assignCurrentSprint(input)).updated).toEqual([
      { number: 42, from: assigned, to: 7 },
    ]);
  });
  it("現在sprintへの既存割当は保持し、再実行は冪等", async () => {
    const input = fixture([issue(42, 7), issue(43, 6)]);
    await assignCurrentSprint(input);
    expect((await assignCurrentSprint(input)).updated).toEqual([]);
    expect(input.github.rest.issues.update).toHaveBeenCalledTimes(1);
  });
  it("次sprintでもopenなら繰越し、closedは最後の割当を保つ", async () => {
    const input = fixture(
      [issue(42, 7), { ...issue(43, 7), state: "closed" }],
      [milestone(8)],
    );
    expect((await assignCurrentSprint(input)).updated).toEqual([
      { number: 42, from: 7, to: 8 },
    ]);
    expect(input.github.rest.issues.update).toHaveBeenCalledTimes(1);
  });
  it("review/demo当日00:00から未完了を次期へ移し、closedは前期に残す", async () => {
    const issues = [issue(42, 7), { ...issue(43, 7), state: "closed" }];
    const input = fixture(issues, [
      milestone(),
      milestone(8, "2026-10-14", "2026-10-22T00:00:00Z"),
    ]);
    const result = await assignCurrentSprint({
      ...input,
      now: () => new Date("2026-10-13T15:00:00Z"),
    });
    expect(result.updated).toEqual([{ number: 42, from: 7, to: 8 }]);
    expect(issues[1].milestone?.number).toBe(7);
  });
  it("dry-runは付替え予定だけ返し、外部書込しない", async () => {
    const input = fixture([issue(42, 6)]);
    const result = await assignCurrentSprint({ ...input, dryRun: true });
    expect(result.planned).toEqual([{ number: 42, from: 6, to: 7 }]);
    expect(result.updated).toEqual([]);
    expect(input.github.rest.issues.update).not.toHaveBeenCalled();
  });
  it("dryRun省略時も外部書込しない", async () => {
    const { dryRun: _dryRun, ...input } = fixture();
    expect((await assignCurrentSprint(input)).planned).toHaveLength(1);
    expect(input.github.rest.issues.update).not.toHaveBeenCalled();
  });
  it("IssueAPIに混在するPRとclosedを除外し、全ページを読む", async () => {
    const input = fixture([
      issue(42),
      issue(43),
      issue(42),
      { ...issue(44), pull_request: { url: "pr" } },
      { ...issue(45), state: "closed" },
    ]);
    expect((await assignCurrentSprint(input)).updated).toEqual([
      { number: 42, from: null, to: 7 },
      { number: 43, from: null, to: 7 },
    ]);
    expect(input.github.paginate).toHaveBeenCalledWith(
      input.github.rest.issues.listForRepo,
      {
        owner: "engineer-first",
        repo: "idea-boost",
        state: "open",
        per_page: 100,
      },
    );
    expect(input.github.paginate).toHaveBeenCalledWith(
      input.github.rest.issues.listMilestones,
      {
        owner: "engineer-first",
        repo: "idea-boost",
        state: "all",
        per_page: 100,
      },
    );
    expect(input.github.rest.issues.get).toHaveBeenCalledTimes(2);
  });
  it("更新直前にclosed・PR・現在割当へ変わったIssueは保持する", async () => {
    for (const latest of [
      { ...issue(), state: "closed" },
      { ...issue(), pull_request: { url: "pr" } },
      issue(42, 7),
    ]) {
      const input = fixture();
      input.github.rest.issues.get.mockResolvedValue({ data: latest });
      await assignCurrentSprint(input);
      expect(input.github.rest.issues.update).not.toHaveBeenCalled();
    }
  });
  it("更新直前に別Milestoneへ変わっても、その最新値を繰越履歴に使う", async () => {
    const input = fixture([issue(42, 6)]);
    input.github.rest.issues.get.mockResolvedValue({ data: issue(42, 8) });
    expect((await assignCurrentSprint(input)).updated).toEqual([
      { number: 42, from: 8, to: 7 },
    ]);
  });
  it("実行中の期間変更・closed化で古いsprintを付与しない", async () => {
    for (const changed of [
      [],
      [milestone(8)],
      [{ ...milestone(), state: "closed" }],
    ]) {
      const input = fixture();
      input.github.paginate.mockImplementation(async (method) =>
        method === input.github.rest.issues.listMilestones
          ? changed
          : [issue()],
      );
      input.github.paginate.mockResolvedValueOnce([milestone()]);
      await assignCurrentSprint(input);
      expect(input.github.rest.issues.update).not.toHaveBeenCalled();
    }
  });
  it("Issue再読取中に期間を跨いだら、書込を止める", async () => {
    const input = fixture();
    const clock = vi
      .fn()
      .mockReturnValueOnce(now())
      .mockReturnValueOnce(now())
      .mockReturnValue(new Date("2026-10-13T15:00:00Z"));
    await assignCurrentSprint({ ...input, now: clock });
    expect(input.github.rest.issues.update).not.toHaveBeenCalled();
  });
  it("読取・書込失敗を成功扱いせず、余分なIssue更新をしない", async () => {
    const input = fixture();
    input.github.rest.issues.get.mockRejectedValue(new Error("forbidden"));
    await expect(assignCurrentSprint(input)).rejects.toThrow("forbidden");
    expect(input.github.rest.issues.update).not.toHaveBeenCalled();
    input.github.rest.issues.get.mockResolvedValue({ data: issue() });
    input.github.rest.issues.update.mockRejectedValue(
      new Error("write forbidden"),
    );
    await expect(assignCurrentSprint(input)).rejects.toThrow("write forbidden");
  });
});

it("定期更新はdefault branchだけで実行し、手動実行はdry-runを既定にする", () => {
  const source = readFileSync(
    ".github/workflows/assign-current-sprint.yml",
    "utf8",
  );
  const workflow = parse(source);
  expect(workflow.on.workflow_dispatch.inputs.dry_run.default).toBe(true);
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.jobs.assign.permissions).toEqual({
    contents: "read",
    issues: "write",
  });
  expect(workflow.jobs.assign.if).toBe(
    "github.ref == format('refs/heads/{0}', github.event.repository.default_branch)",
  );
  expect(workflow.jobs.assign.steps[0].with).toEqual({
    ref: `\${{ github.event.repository.default_branch }}`,
    "persist-credentials": false,
  });
  expect(source).not.toMatch(/secrets\.|create-github-app-token|pull_request:/);
});

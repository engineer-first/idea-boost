import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("Spike・種類なしも作業時間に含め、PBI・旧DemoGoal・相談を除外する", () => {
  const dir = mkdtempSync(join(tmpdir(), "burndown-"));
  const issues = [
    "Task",
    "Bug",
    "Spike",
    null,
    "PBI",
    "DemoGoal",
    "相談・要望",
  ].map((type, index) => ({
    number: index + 1,
    title: `issue ${index + 1}`,
    state: index === 2 ? "CLOSED" : "OPEN",
    issueType: type ? { name: type } : null,
    labels: { nodes: [{ name: "est:2h" }] },
    milestone: null,
  }));
  writeFileSync(
    join(dir, "fixture.json"),
    JSON.stringify({
      data: {
        repository: {
          milestones: {
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                title: "対象スプリント",
                dueOn: null,
                issues: { pageInfo: { hasNextPage: false }, nodes: issues },
              },
            ],
          },
          noMilestone: {
            pageInfo: { hasNextPage: false },
            nodes: issues.filter((issue) => issue.state === "OPEN"),
          },
        },
      },
    }),
  );
  writeFileSync(join(dir, "gh"), '#!/bin/sh\ncat "$BURNDOWN_FIXTURE"\n', {
    mode: 0o755,
  });
  try {
    const summary = JSON.parse(
      execFileSync("bash", ["scripts/burndown.sh", "--all", "--json"], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          BURNDOWN_FIXTURE: join(dir, "fixture.json"),
        },
      }),
    );
    expect(summary.sprints[0]).toMatchObject({
      tasks_total: 4,
      total_h: 8,
      done_h: 2,
      remaining_h: 6,
    });
    expect(summary.no_milestone).toMatchObject({
      tasks_total: 3,
      remaining_h: 6,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("PBI配下Taskは数値時間を優先し、他の作業は既存ラベルだけを集計する", () => {
  const dir = mkdtempSync(join(tmpdir(), "burndown-fields-"));
  const issues = [
    { type: "Task", parent: "PBI", hours: 1.5, label: "est:8h" },
    { type: "Task", parent: "PBI", hours: null, label: "est:2h" },
    { type: "Task", parent: null, hours: 9, label: "est:1h" },
    { type: "Bug", parent: "PBI", hours: 9, label: "est:4h" },
    { type: "PBI", parent: null, hours: 9, label: "est:8h" },
    { type: "Task", parent: "PBI", hours: 0.5, label: null },
    { type: "Task", parent: "PBI", hours: null, label: null },
  ].map((v, i) => ({
    number: i + 1,
    title: "作業",
    state: "OPEN",
    milestone: null,
    issueType: { name: v.type },
    parent: v.parent ? { issueType: { name: v.parent } } : null,
    labels: { nodes: v.label ? [{ name: v.label }] : [] },
    issueFieldValues: {
      nodes: [
        { field: { name: "Story points" }, value: 13 },
        ...(v.hours === null
          ? []
          : [{ field: { name: "Estimate Hours" }, value: v.hours }]),
      ],
    },
  }));
  writeFileSync(
    join(dir, "fixture.json"),
    JSON.stringify({
      data: {
        repository: {
          milestones: { pageInfo: { hasNextPage: false }, nodes: [] },
          noMilestone: { pageInfo: { hasNextPage: false }, nodes: issues },
        },
      },
    }),
  );
  writeFileSync(join(dir, "gh"), '#!/bin/sh\ncat "$BURNDOWN_FIXTURE"\n', {
    mode: 0o755,
  });
  try {
    const output = execFileSync("bash", ["scripts/burndown.sh", "--json"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        BURNDOWN_FIXTURE: join(dir, "fixture.json"),
      },
    });
    expect(JSON.parse(output).no_milestone).toMatchObject({
      tasks_total: 6,
      remaining_h: 9,
      unestimated: [{ number: 7, state: "OPEN", title: "作業" }],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

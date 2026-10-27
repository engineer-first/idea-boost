import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("種類を限定せずPBI配下の末端作業を含め、PBIを除外する", () => {
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
    parent: { issueType: { name: "PBI" } },
    subIssues: { totalCount: 0 },
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
  writeFileSync(
    join(dir, "gh"),
    '#!/bin/sh\nif [ "$2" = graphql ]; then cat "$BURNDOWN_FIXTURE"; else printf \'%s\\n\' "$BURNDOWN_FIELDS"; fi\n',
    {
      mode: 0o755,
    },
  );
  try {
    const summary = JSON.parse(
      execFileSync("bash", ["scripts/burndown.sh", "--all", "--json"], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          BURNDOWN_FIXTURE: join(dir, "fixture.json"),
          BURNDOWN_FIELDS: "[]",
        },
      }),
    );
    expect(summary.sprints[0]).toMatchObject({
      tasks_total: 6,
      total_h: 12,
      done_h: 2,
      remaining_h: 10,
    });
    expect(summary.no_milestone).toMatchObject({
      tasks_total: 5,
      remaining_h: 10,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each([
  false,
  true,
])("正式fieldの空欄は旧ラベルへ戻さず、親作業と対象外も集計しない（明示null=%s）", (explicitNull) => {
  const dir = mkdtempSync(join(tmpdir(), "burndown-fields-"));
  const issues = [
    { type: "Task", parent: "PBI", hours: 1.5, label: "est:8h" },
    { type: "Task", parent: "PBI", hours: null, label: "est:2h" },
    { type: "Task", parent: null, hours: 9, label: "est:1h" },
    { type: "Bug", parent: "PBI", hours: 9, label: "est:4h" },
    { type: "PBI", parent: null, hours: 9, label: "est:8h" },
    { type: "Task", parent: "PBI", hours: 0.5, label: null },
    { type: "Task", parent: "PBI", hours: null, label: "est:16h" },
  ].map((v, i) => ({
    number: i + 1,
    title: "作業",
    state: "OPEN",
    milestone: null,
    issueType: { name: v.type },
    subIssues: { totalCount: i === 1 ? 1 : 0 },
    parent: v.parent ? { issueType: { name: v.parent } } : null,
    labels: { nodes: v.label ? [{ name: v.label }] : [] },
    issueFieldValues: {
      nodes: [
        { field: { name: "Story points" }, value: 13 },
        ...(v.hours === null && !explicitNull
          ? []
          : [
              { field: { id: "IF55", name: "Estimate Hours" }, value: v.hours },
            ]),
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
  writeFileSync(
    join(dir, "gh"),
    '#!/bin/sh\nif [ "$2" = graphql ]; then cat "$BURNDOWN_FIXTURE"; else printf \'%s\\n\' "$BURNDOWN_FIELDS"; fi\n',
    {
      mode: 0o755,
    },
  );
  try {
    const output = execFileSync("bash", ["scripts/burndown.sh", "--json"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        BURNDOWN_FIXTURE: join(dir, "fixture.json"),
        BURNDOWN_FIELDS: JSON.stringify([
          {
            name: "Estimate Hours",
            data_type: "number",
            visibility: "all",
            node_id: "IF55",
          },
        ]),
      },
    });
    expect(JSON.parse(output).no_milestone).toMatchObject({
      tasks_total: 4,
      remaining_h: null,
      known_remaining_h: 11,
      unestimated: [{ number: 7, state: "OPEN", title: "作業" }],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each([
  {
    fields: [
      {
        name: "Estimate Hours",
        data_type: "text",
        visibility: "all",
        node_id: "IF55",
      },
    ],
    fail: false,
  },
  {
    fields: [{ name: "Estimate Hours" }, { name: "Estimate Hours" }],
    fail: false,
  },
  { fields: [], fail: true },
])("field定義の不正・重複・取得失敗を旧ラベルへ置き換えない（%j）", ({
  fields,
  fail,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "burndown-metadata-"));
  writeFileSync(
    join(dir, "gh"),
    '#!/bin/sh\nif [ "$2" = graphql ]; then echo unexpected-query >&2; exit 99; fi\nif [ "$METADATA_FAIL" = true ]; then exit 1; fi\nprintf \'%s\\n\' "$METADATA"\n',
    { mode: 0o755 },
  );
  try {
    expect(() =>
      execFileSync("bash", ["scripts/burndown.sh", "--json"], {
        stdio: "pipe",
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          METADATA: JSON.stringify(fields),
          METADATA_FAIL: String(fail),
        },
      }),
    ).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

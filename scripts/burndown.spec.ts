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

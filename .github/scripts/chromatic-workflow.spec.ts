// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Step = {
  uses?: string;
  with?: Record<string, unknown>;
  "continue-on-error"?: boolean;
};

const workflow = parse(
  readFileSync(new URL("../workflows/chromatic.yml", import.meta.url), "utf8"),
);
const job = workflow.jobs.chromatic;
const publish: Step = job.steps.find((step: Step) =>
  step.uses?.startsWith("chromaui/action@"),
);

describe("Storybookの公開CI", () => {
  it("pushした版を公開し、依存更新botだけ公開を省略する", () => {
    expect(workflow.on).toBe("push");
    expect(publish.with?.projectToken).toBe(
      ["$", "{{ secrets.CHROMATIC_PROJECT_TOKEN }}"].join(""),
    );
    expect(publish.with?.skip).toBe("@(renovate/**|dependabot/**)");
    expect(publish.with?.exitOnceUploaded).toBe(true);
  });

  it("撮影対象追跡や差分承認を行わない", () => {
    for (const option of [
      "autoAcceptChanges",
      "exitZeroOnChanges",
      "onlyChanged",
      "untraced",
      "externals",
    ]) {
      expect(publish.with).not.toHaveProperty(option);
    }
  });

  it("公開に至る前のビルド・アップロードの失敗を隠さない", () => {
    expect(job["continue-on-error"]).not.toBe(true);
    for (const step of job.steps as Step[]) {
      expect(step["continue-on-error"]).not.toBe(true);
    }
    expect(publish.with).not.toHaveProperty("dryRun");
    expect(publish.with).not.toHaveProperty("buildCommand");
  });
});

// @vitest-environment node
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("PBI作成の任意SP・既存値保護・API失敗時の継続を検証する", () => {
  expect(() =>
    execFileSync(
      "python3",
      [
        "-m",
        "unittest",
        "discover",
        "-s",
        ".agents/skills/pbi/scripts",
        "-p",
        "test_*.py",
      ],
      { stdio: "pipe", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
    ),
  ).not.toThrow();
});

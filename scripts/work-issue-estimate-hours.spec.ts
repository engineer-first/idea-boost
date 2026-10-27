// @vitest-environment node
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("作業Issue起票の任意時間・親の確認・既存値保持・失敗時の継続を検証する", () => {
  expect(() =>
    execFileSync(
      "python3",
      [
        "-m",
        "unittest",
        "discover",
        "-s",
        ".agents/skills/create-work-issue/scripts",
        "-p",
        "test_*.py",
      ],
      { stdio: "pipe", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
    ),
  ).not.toThrow();
});

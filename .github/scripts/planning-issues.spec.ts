import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("PBI 作成の採番・部分失敗・初期状態を外部通信なしで検証する", () => {
  expect(() =>
    execFileSync(
      "python3",
      [
        "-m",
        "unittest",
        "discover",
        "-s",
        ".agents/skills/pbi-demogoal/scripts",
        "-p",
        "test_*.py",
      ],
      { encoding: "utf8" },
    ),
  ).not.toThrow();
});

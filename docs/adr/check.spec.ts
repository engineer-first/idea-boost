import { describe, expect, it } from "vitest";
import { validateAdr } from "./check.mjs";

const valid = `---
id: "0001"
date: "2026-11-03"
---
# ADR 0001: 判断
## Context
事実。
## Decision
方針。
### 本ADRで決定しないこと
仕様へ委譲する。
## Consequences
影響。
## References
出典。
`;

describe("ADRの構造検査", () => {
  it("指定形式のADRを受理する", () => {
    expect(validateAdr("0001-example.md", valid)).toEqual([]);
  });

  it.each([
    ["idを欠く", valid.replace('id: "0001"\n', ""), "id"],
    ["ファイル名とidが違う", valid.replace('id: "0001"', 'id: "0002"'), "id"],
    [
      "statusを持つ",
      valid.replace('id: "0001"\n', 'id: "0001"\nstatus: Accepted\n'),
      "status",
    ],
    [
      "Supersession節に後継のリンクがない",
      valid.replace(
        "## References",
        "## Supersession\n後継へ置き換えた。\n## References",
      ),
      "Supersession",
    ],
    ["存在しない日付", valid.replace("2026-11-03", "2026-02-30"), "date"],
    ["判断を欠く", valid.replace("## Decision\n方針。\n", ""), "Decision"],
    ["出典を欠く", valid.replace("## References\n出典。\n", ""), "References"],
    [
      "委譲先の節を欠く",
      valid.replace("### 本ADRで決定しないこと\n仕様へ委譲する。\n", ""),
      "本ADRで決定しないこと",
    ],
    [
      "本文にIssue番号がある",
      valid.replace("事実。", "Issue #123の事実。"),
      "References",
    ],
  ])("%s場合は拒否する", (_name, input, expected) => {
    expect(validateAdr("0001-example.md", input).join("\n")).toContain(
      expected,
    );
  });

  it("Supersession節に後継のリンクがあれば受理する", () => {
    expect(
      validateAdr(
        "0001-example.md",
        valid.replace(
          "## References",
          "## Supersession\n[ADR 0002](0002-example.md)が置き換える。\n## References",
        ),
      ),
    ).toEqual([]);
  });
});

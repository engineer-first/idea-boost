import { describe, expect, it } from "vitest";
import { buildHmwHintQuestion, HMW_HINT_GROUPS } from "./hmw-hints";

describe("問いのヒント", () => {
  it("異なる観点の3語を提示し、一巡するまで12語を重複させない", () => {
    const hints = HMW_HINT_GROUPS.flat();
    expect(hints).toHaveLength(12);
    expect(new Set(hints.map((hint) => hint.id)).size).toBe(12);
    for (const group of HMW_HINT_GROUPS) {
      expect(group).toHaveLength(3);
      expect(new Set(group.map((hint) => hint.perspective)).size).toBe(3);
    }
  });

  it("同じ課題でも選んだワードに対応する異なる問いを組み立てる", () => {
    const questions = HMW_HINT_GROUPS[0].map((hint) =>
      buildHmwHintQuestion("睡眠不足で眠たい", hint),
    );
    expect(new Set(questions).size).toBe(3);
    expect(questions).toContain(
      "どうしたら、「睡眠不足で眠たい」という状況を前もって防げるか？",
    );
    for (const question of questions)
      expect(question).toContain("睡眠不足で眠たい");
  });

  it("課題の特殊文字・改行・差し込みに見える文字も原文のまま保持する", () => {
    const issue = "費用$&と$1が高い\n<img src=x> {issue}";
    const question = buildHmwHintQuestion(issue, HMW_HINT_GROUPS[0][0]);
    expect(question).toContain(`「${issue}」`);
  });

  it.each([null, "", " \n "])(
    "決定課題がない場合は問いを作らない（%j）",
    (issue) => {
      expect(buildHmwHintQuestion(issue, HMW_HINT_GROUPS[0][0])).toBeNull();
    },
  );
});

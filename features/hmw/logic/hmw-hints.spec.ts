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
    const bracketed = buildHmwHintQuestion(issue, HMW_HINT_GROUPS[0][1]);
    expect(bracketed).toContain(`「${issue}」`);
    const plain = buildHmwHintQuestion(issue, HMW_HINT_GROUPS[0][0]);
    expect(plain).toContain(issue);
  });

  it.each([null, "", " \n "])(
    "決定課題がない場合は問いを作らない（%j）",
    (issue) => {
      expect(buildHmwHintQuestion(issue, HMW_HINT_GROUPS[0][0])).toBeNull();
    },
  );

  it("差し替えた5つのワードと問いかけを提示する", () => {
    const all = HMW_HINT_GROUPS.flat();
    const find = (id: string) => all.find((hint) => hint.id === id);
    expect(find("enjoy")).toMatchObject({
      word: "楽しみ",
      template: "どうやったら{issue}を楽しめるだろう？",
    });
    expect(find("motivation")).toMatchObject({
      word: "やる気",
      template: "{issue}という困りごとに対してモチベーションを上げる方法は？",
    });
    expect(find("reason")).toMatchObject({
      word: "理由",
      template: "そもそもなぜ{issue}に困っているの？",
    });
    expect(find("standpoint")).toMatchObject({
      word: "立場",
      template: "自分以外の気持ちになって考えてみたら考え方は変わるだろうか？",
    });
    expect(find("avoid")).toMatchObject({
      word: "回避",
      template: "{issue}という困りごとをしなくても済む方法は？",
    });
  });

  it("差し込みを含まない問いかけは、決定課題がなくてもそのまま返す", () => {
    const withoutIssue = HMW_HINT_GROUPS.flat().filter(
      (hint) => !hint.template.includes("{issue}"),
    );
    // インタビュー形式のワードが少なくともあることを確認する。
    expect(withoutIssue.length).toBeGreaterThan(0);
    for (const hint of withoutIssue) {
      expect(buildHmwHintQuestion(null, hint)).toBe(hint.template);
      expect(buildHmwHintQuestion("朝起きれない", hint)).toBe(hint.template);
    }
  });
});

import { describe, expect, it } from "vitest";
import { DEMO_CHECKPOINTS, getDemoGuide } from "./demo-copy";

describe("全ステップの説明者ガイド", () => {
  it("全14ステップの開始場面を順番に選べる", () => {
    expect(
      DEMO_CHECKPOINTS.map((item) => `${item.phase}-${item.step}`),
    ).toEqual([
      "1-1",
      "1-2",
      "1-3",
      "1-4",
      "1-5",
      "2-1",
      "2-2",
      "2-3",
      "2-4",
      "3-1",
      "3-2",
      "3-3",
      "3-4",
      "3-5",
    ]);
  });
  it("全ステップに目的・自動準備・手動操作・具体例を示し時間制限を置かない", () => {
    for (const item of DEMO_CHECKPOINTS) {
      const guide = getDemoGuide({
        kind: "step",
        phase: item.phase,
        step: item.step,
      });
      expect(guide.purpose.length).toBeGreaterThan(0);
      expect(guide.prepared.length).toBeGreaterThan(0);
      expect(guide.manual.length).toBeGreaterThan(0);
      expect(guide.examples.length).toBeGreaterThan(0);
      expect(guide.narration.length).toBeGreaterThan(0);
      expect(JSON.stringify(guide)).not.toMatch(
        /約\d+分|\d+秒|制限時間|急いで/,
      );
    }
  });
  it("1-3には命名例とグループ例配置後の手動変更を示す", () => {
    const guide = getDemoGuide({ kind: "step", phase: 1, step: 3 });
    expect(guide.examples.map((example) => example.text)).toEqual(
      expect.arrayContaining([
        "学び合う相手探し",
        "昼休みの混雑",
        "空きコマに学び合える仲間がほしい",
      ]),
    );
    expect(guide.manual.join(" ")).toContain("グループ例を配置する");
    expect(guide.manual.join(" ")).toContain("グループ名");
  });
  it("HMWとアイデアにも自分の下書きが用意され編集例を案内する", () => {
    for (const phase of [2, 3] as const) {
      const guide = getDemoGuide({ kind: "step", phase, step: 1 });
      expect(guide.prepared).toContain("自分の2枚");
      expect(guide.manual.join(" ")).toContain("編集");
    }
    expect(
      getDemoGuide({ kind: "step", phase: 2, step: 1 }).examples[0].text,
    ).toContain("どうすれば");
    expect(
      getDemoGuide({ kind: "step", phase: 3, step: 3 }).narration,
    ).toContain("実現");
  });
});

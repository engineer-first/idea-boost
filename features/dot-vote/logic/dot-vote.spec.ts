import { describe, expect, it } from "vitest";
import {
  dotVoteGuidance,
  dotVoteLabels,
  dotVoteRemainingLabel,
  dotVoteStickerName,
  dotVoteStickerTooltip,
} from "./dot-vote";

describe("投票シールの画面の名前", () => {
  it.each([
    [1, "いいね"],
    [2, "いいね"],
    [3, "需要ありそう"],
  ] as const)(
    "フェーズ %i では「需要ありそう」の枠（objective）を「%s」と呼び、イチオシ！は変えない",
    (phase, objectiveLabel) => {
      expect(dotVoteLabels(phase)).toEqual({
        subjective: "イチオシ！",
        objective: objectiveLabel,
      });
    },
  );

  it("課題フェーズのシール名・残票・ツールチップ・案内はフェーズの名前を使う", () => {
    expect(dotVoteStickerName("objective", 1)).toBe("「いいね」シール");
    expect(dotVoteRemainingLabel("objective", 3, 1)).toBe(
      "「いいね」シール 残り3票",
    );
    expect(dotVoteStickerTooltip("objective", 1)).toBe("いいね（客観）");
    expect(dotVoteGuidance(1).allowance).toBe("イチオシ！1票・いいね3票");
  });

  it("アイデアフェーズは「需要ありそう」のまま", () => {
    expect(dotVoteStickerName("objective", 3)).toBe("「需要ありそう」シール");
    expect(dotVoteGuidance(3).summary).toBe(
      "イチオシ！1票・需要ありそう3票を使い、現在のフェーズの個々の付箋へ投票します。",
    );
  });
});

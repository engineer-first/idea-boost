import { describe, expect, it } from "vitest";
import { CarryoverSchema } from "./room-protocol";

const reference = {
  phase: 1,
  noteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  content: "採用時点の本文",
  color: "pink",
  fontSize: 20,
  dotVotes: { subjective: 2, objective: 3 },
};

describe("Carryover の参照データ", () => {
  it("個人の投票先や投票者を参照境界に含められない", () => {
    for (const extra of [
      { votedByMe: true },
      { voters: ["private-user"] },
      { dotVotes: { ...reference.dotVotes, voters: ["private-user"] } },
    ]) {
      expect(
        CarryoverSchema.safeParse({ ...reference, ...extra }).success,
      ).toBe(false);
    }
  });
  it("欠損を null で伝え、色・文字サイズ・票数の不正値を拒否する", () => {
    expect(CarryoverSchema.parse(reference)).toEqual(reference);
    const missing = {
      ...reference,
      color: null,
      fontSize: null,
      dotVotes: null,
    };
    expect(CarryoverSchema.parse(missing)).toEqual(missing);
    for (const extra of [
      { color: "black" },
      { fontSize: 40 },
      { dotVotes: { subjective: -1, objective: 3 } },
    ]) {
      expect(
        CarryoverSchema.safeParse({ ...reference, ...extra }).success,
      ).toBe(false);
    }
  });
});

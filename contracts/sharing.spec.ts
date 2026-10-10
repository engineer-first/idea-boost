import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "./phase.fixture";
import { buildSharingState } from "./room-protocol.fixture";
import { canPublishNoteInTurn, canReturnNoteToPrivateInTurn } from "./sharing";

describe("発表中の付箋共有許可", () => {
  const userId = "presenter";
  const active = buildSharingState({
    status: "active",
    currentIndex: 0,
    startsAt: null,
    order: [{ userId, name: "発表者", color: "yellow" }],
  });
  it.each([
    1, 2, 3,
  ] as const)("フェーズ%iの共有中は発表者本人だけ公開できる", (phase) => {
    expect(canPublishNoteInTurn(buildPhaseStep(2, phase), active, userId)).toBe(
      true,
    );
    expect(
      canPublishNoteInTurn(buildPhaseStep(2, phase), active, "listener"),
    ).toBe(false);
  });
  it.each([
    null,
    { ...active, status: "ready" as const, currentIndex: null },
    { ...active, status: "inactive" as const, currentIndex: null },
    { ...active, status: "complete" as const, currentIndex: null },
    { ...active, startsAt: Date.now() + 2000 },
    { ...active, currentIndex: 10 },
  ])("発表中以外では公開しない（%j）", (sharing) => {
    expect(canPublishNoteInTurn(buildPhaseStep(2), sharing, userId)).toBe(
      false,
    );
  });
  it.each([1, 3, 4, 5])("共有以外のstep%iでは公開しない", (step) => {
    expect(canPublishNoteInTurn(buildPhaseStep(step), active, userId)).toBe(
      false,
    );
  });
});

describe("発表中の共有付箋返却許可", () => {
  const userId = "presenter";
  const active = buildSharingState({
    status: "active",
    currentIndex: 0,
    startsAt: null,
    order: [
      { userId, name: "発表者", color: "yellow" },
      { userId: "listener", name: "待機者", color: "green" },
    ],
  });

  it("発表中は発表者本人だけ返却できる", () => {
    const phase = buildPhaseStep(2);
    expect(canReturnNoteToPrivateInTurn(phase, active, userId)).toBe(true);
    expect(canReturnNoteToPrivateInTurn(phase, active, "listener")).toBe(false);
  });

  it("共有の順番が有効でない場合は既存の工程権限に委ねる", () => {
    expect(
      canReturnNoteToPrivateInTurn(
        buildPhaseStep(2),
        { ...active, status: "ready", currentIndex: null },
        "listener",
      ),
    ).toBe(true);
  });
});

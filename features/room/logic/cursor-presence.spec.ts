import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { ServerMessage } from "@/contracts/room-protocol";
import {
  applyCursorPresenceMessage,
  isCursorPresenceAllowed,
  isRemoteCursorIdle,
  type RemoteCursorPresence,
} from "./cursor-presence";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function update(
  userId = OTHER,
): Extract<ServerMessage, { type: "cursor:updated" }> {
  return {
    type: "cursor:updated",
    cursor: {
      userId,
      name: "Taro Yamada",
      color: "green",
      x: 120,
      y: 240,
      draggingNoteId: null,
    },
  };
}

describe("cursor presence reducer", () => {
  it("他ユーザーの最新位置を受信時刻とともに追加・更新する", () => {
    const phase = buildPhaseStep(2);
    const first = applyCursorPresenceMessage([], update(), ME, phase, 1_000);
    const second = applyCursorPresenceMessage(
      first,
      update(),
      ME,
      phase,
      1_500,
    );

    expect(second).toEqual([
      expect.objectContaining({ userId: OTHER, x: 120, lastSeenAt: 1_500 }),
    ]);
  });

  it("自分自身のカーソルは状態へ追加しない", () => {
    expect(
      applyCursorPresenceMessage([], update(ME), ME, buildPhaseStep(2), 1_000),
    ).toEqual([]);
  });

  it("ステルス投票への遷移、退出、切断通知で対象を消す", () => {
    const cursor: RemoteCursorPresence = {
      ...update().cursor,
      lastSeenAt: 1_000,
    };
    expect(
      applyCursorPresenceMessage(
        [cursor],
        { type: "phase:updated", phase: buildPhaseStep(4) },
        ME,
        buildPhaseStep(2),
        2_000,
      ),
    ).toEqual([]);
    expect(
      applyCursorPresenceMessage(
        [cursor],
        { type: "member_left", userId: OTHER },
        ME,
        buildPhaseStep(2),
        2_000,
      ),
    ).toEqual([]);
    expect(
      applyCursorPresenceMessage(
        [cursor],
        { type: "cursor:left", userId: OTHER },
        ME,
        buildPhaseStep(2),
        2_000,
      ),
    ).toEqual([]);
  });

  it("再接続 snapshot は一時的なカーソル状態を復元しない", () => {
    const cursor: RemoteCursorPresence = {
      ...update().cursor,
      lastSeenAt: 1_000,
    };
    const snapshot = {
      type: "snapshot",
      notes: [],
      members: [],
      phase: buildPhaseStep(2),
      isHost: false,
      decision: null,
      carryovers: [],
      timer: { status: "idle" },
      serverNow: 2_000,
    } satisfies ServerMessage;
    expect(
      applyCursorPresenceMessage(
        [cursor],
        snapshot,
        ME,
        buildPhaseStep(2),
        2_000,
      ),
    ).toEqual([]);
  });
});

describe("cursor presence policy", () => {
  it("共有作業ステップだけを許可し、個人執筆とステルス投票を拒否する", () => {
    expect(isCursorPresenceAllowed(buildPhaseStep(2))).toBe(true);
    expect(isCursorPresenceAllowed(buildPhaseStep(3))).toBe(true);
    expect(isCursorPresenceAllowed(buildPhaseStep(1))).toBe(false);
    expect(isCursorPresenceAllowed(buildPhaseStep(4))).toBe(false);
  });

  it("一定時間動かないカーソルを idle と判定する", () => {
    expect(isRemoteCursorIdle({ lastSeenAt: 1_000 }, 3_999)).toBe(false);
    expect(isRemoteCursorIdle({ lastSeenAt: 1_000 }, 4_000)).toBe(true);
  });
});

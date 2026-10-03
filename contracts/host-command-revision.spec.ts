import { describe, expect, it } from "vitest";
import { ClientMessageSchema, ServerMessageSchema } from "./room-protocol";

const id = "11111111-1111-4111-8111-111111111111";
const phase = { kind: "step", phase: 1, step: 1 };
const commands = [
  { type: "start_phase" },
  ...["phase:next", "phase:restart-writing", "phase:revote"].map((type) => ({
    type,
    expectedPhase: phase,
    expectedRevision: 0,
  })),
  { type: "timer:start", durationMs: 1000 },
  ...["timer:pause", "timer:resume", "timer:extend", "timer:stop"].map(
    (type) => ({ type }),
  ),
  { type: "sharing:start", revision: id, durationMs: 1000 },
  { type: "sharing:advance", revision: id, outcome: "done" },
  ...[
    "note:exclude",
    "note:restore",
    "note:decide",
    "decision:clear",
    "adoption-focus:update",
  ].map((type) => ({ type, noteId: id })),
  { type: "note:bulk-exclude" },
  { type: "note:bulk-restore", operationId: id },
  { type: "outcome:publish" },
  { type: "idea-map:resize", sizeLevel: 1 },
];
describe("ホスト操作の世代境界", () => {
  it.each(
    commands,
  )("$type のホスト世代を落とさず保持し、不正な世代は拒否する", (message) => {
    expect(
      ClientMessageSchema.parse({ ...message, expectedHostRevision: 2 }),
    ).toMatchObject({ expectedHostRevision: 2 });
    for (const expectedHostRevision of [-1, 0.5, "2"])
      expect(
        ClientMessageSchema.safeParse({ ...message, expectedHostRevision })
          .success,
      ).toBe(false);
    expect(ClientMessageSchema.safeParse(message).success).toBe(true);
  });
  it("移譲の操作IDを要求と成功通知に保持する", () => {
    expect(
      ClientMessageSchema.parse({
        type: "host:transfer",
        targetUserId: id,
        expectedHostRevision: 0,
        operationId: id,
      }),
    ).toMatchObject({ operationId: id });
    expect(
      ServerMessageSchema.parse({
        type: "host:updated",
        hostUserId: id,
        hostRevision: 1,
        operationId: id,
      }),
    ).toMatchObject({ operationId: id });
  });
});

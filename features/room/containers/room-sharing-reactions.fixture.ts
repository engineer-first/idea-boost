import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { ServerMessage } from "@/contracts/room-protocol";
import type { SharingReactionKind } from "@/contracts/sharing-reactions";
import type { RoomSharingReactionsProps } from "./room-sharing-reactions";

type RoomSharingReactionsFixture = Omit<
  RoomSharingReactionsProps,
  "children" | "messageRef" | "send"
>;

export function buildRoomSharingReactionsFixture(
  overrides: Partial<RoomSharingReactionsFixture> = {},
): RoomSharingReactionsFixture {
  return {
    phase: buildPhaseStep(2),
    phaseRevision: 3,
    connectionStatus: "open",
    blocked: false,
    ...overrides,
  };
}

export function buildRoomSharingReactionEvent(
  kind: SharingReactionKind = "question",
  sequence = 1,
  phaseRevision = 3,
): Extract<ServerMessage, { type: "reaction:received" }> {
  return {
    type: "reaction:received",
    id: `11111111-1111-4111-8111-${String(sequence).padStart(12, "0")}`,
    senderId: "22222222-2222-4222-8222-222222222222",
    kind,
    phaseRevision,
  };
}

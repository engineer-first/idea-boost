import type {
  ParticipationConfirmation,
  ParticipationSource,
} from "@/contracts/room-participation";
export function switchConfirmation(
  action: ParticipationSource["action"] = "leave",
): ParticipationConfirmation {
  return {
    operationId: "22222222-2222-4222-8222-222222222222",
    version: 0,
    target: { kind: "join", code: "AB12CD" },
    targetName: "ルームB",
    sources: [
      {
        roomId: "33333333-3333-4333-8333-333333333333",
        name: "ルームA",
        inviteCode: "EF34GH",

        action,
      },
    ],
  };
}

export function failedParticipation() {
  return {
    kind: "rejected" as const,
    reason: "room_full",
    error: "移動先のルームが満員になりました。",
    failure: {
      operationId: switchConfirmation().operationId,
      exitedSources: [
        {
          roomId: "33333333-3333-4333-8333-333333333333",
          name: "元のルーム",
          result: "left" as const,
        },
      ],
      remainingSources: [],
    },
  };
}

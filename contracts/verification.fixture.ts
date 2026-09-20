import {
  type VerificationActive,
  VerificationActiveSchema,
  type VerificationStatus,
  VerificationStatusSchema,
} from "./verification";
export function buildVerificationActive(
  overrides: Partial<VerificationActive> = {},
): VerificationActive {
  return VerificationActiveSchema.parse({
    roomId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    inviteCode: "ABC123",
    checkpoint: "2-3",
    ...overrides,
  });
}
export function buildVerificationStatus(
  overrides: Partial<VerificationStatus> = {},
): VerificationStatus {
  return VerificationStatusSchema.parse({
    phase: { kind: "step", phase: 2, step: 3 },
    canCompleteVotes: true,
    completedOtherVoters: 1,
    ...overrides,
  });
}

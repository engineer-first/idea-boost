import type {
  ParticipationConfirmation,
  ParticipationResult,
} from "@/contracts/room-participation";
export type ParticipationSwitchState =
  | ParticipationConfirmation
  | Extract<ParticipationResult, { kind: "pending" | "rejected" }>;
export function participationSwitchProps(state: ParticipationSwitchState) {
  if (!("kind" in state)) return { confirmation: state };
  return state.kind === "pending"
    ? { pendingOperation: state }
    : { failedOperation: state };
}
export function participationSwitchKey(
  state: ParticipationSwitchState,
): string {
  return "operationId" in state
    ? state.operationId
    : (state.failure?.operationId ?? state.reason);
}

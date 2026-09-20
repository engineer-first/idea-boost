import { HttpResponse, http } from "msw";
import { isResultStep, isVotingStep } from "@/contracts/phase";
import {
  VERIFICATION_CHECKPOINTS,
  type VerificationActive,
  VerificationCreateRequestSchema,
} from "@/contracts/verification";
import {
  buildVerificationActive,
  buildVerificationStatus,
} from "@/contracts/verification.fixture";
export function verificationHandlers({
  failCreate = false,
  onCreate,
}: {
  failCreate?: boolean;
  onCreate?: (checkpoint: string) => void;
} = {}) {
  let active: VerificationActive | null = null;
  let completedOthers = false;
  function status() {
    const phase = VERIFICATION_CHECKPOINTS.find(
      (item) => item.id === active?.checkpoint,
    )?.phase ?? { kind: "lobby" as const };
    return buildVerificationStatus({
      phase,
      canCompleteVotes: isVotingStep(phase),
      completedOtherVoters:
        completedOthers || isResultStep(phase)
          ? 2
          : isVotingStep(phase)
            ? 1
            : 0,
    });
  }
  return [
    http.get("*/api/verification/active", () => HttpResponse.json({ active })),
    http.get("*/api/verification/rooms/:id", () => HttpResponse.json(status())),
    http.post("*/api/verification/rooms/:id/vote", () => {
      completedOthers = true;
      return HttpResponse.json(status());
    }),
    http.post("*/api/verification/rooms", async ({ request }) => {
      if (failCreate)
        return HttpResponse.json({ error: "failed" }, { status: 503 });
      const { checkpoint } = VerificationCreateRequestSchema.parse(
        await request.json(),
      );
      onCreate?.(checkpoint);
      active = buildVerificationActive({
        roomId: crypto.randomUUID(),
        checkpoint,
      });
      completedOthers = false;
      return HttpResponse.json(active);
    }),
  ];
}

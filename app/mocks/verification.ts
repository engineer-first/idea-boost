import { http } from "msw/core/http";
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
    http.get("*/api/verification/active", () => Response.json({ active })),
    http.get("*/api/verification/rooms/:id", () => Response.json(status())),
    http.post("*/api/verification/rooms/:id/vote", () => {
      completedOthers = true;
      return Response.json(status());
    }),
    http.post("*/api/verification/rooms", async ({ request }) => {
      if (failCreate)
        return Response.json({ error: "failed" }, { status: 503 });
      const { checkpoint } = VerificationCreateRequestSchema.parse(
        await request.json(),
      );
      onCreate?.(checkpoint);
      active = buildVerificationActive({
        roomId: crypto.randomUUID(),
        checkpoint,
      });
      completedOthers = false;
      return Response.json(active);
    }),
  ];
}

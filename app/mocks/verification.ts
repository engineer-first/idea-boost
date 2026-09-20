import { HttpResponse, http } from "msw";
import {
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
  return [
    http.get("*/api/verification/active", () => HttpResponse.json({ active })),
    http.get("*/api/verification/rooms/:id", () =>
      HttpResponse.json(buildVerificationStatus()),
    ),
    http.post("*/api/verification/rooms", async ({ request }) => {
      if (failCreate)
        return HttpResponse.json({ error: "failed" }, { status: 503 });
      const { checkpoint } = VerificationCreateRequestSchema.parse(
        await request.json(),
      );
      onCreate?.(checkpoint);
      active = buildVerificationActive({ checkpoint });
      return HttpResponse.json(active);
    }),
  ];
}

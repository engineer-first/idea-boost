import { recoverVerificationOutcome } from "@/features/verification";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return recoverVerificationOutcome(request, (await params).id);
}

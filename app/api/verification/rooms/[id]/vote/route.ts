import { completeVerificationVotes } from "@/features/verification";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return completeVerificationVotes(request, (await params).id);
}

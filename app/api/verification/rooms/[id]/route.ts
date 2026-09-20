import { getVerificationStatus } from "@/features/verification";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return getVerificationStatus((await params).id);
}

import { getDemoStatus } from "@/features/demo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return getDemoStatus((await params).id);
}

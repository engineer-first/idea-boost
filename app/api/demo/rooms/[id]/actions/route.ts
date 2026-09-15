import { runDemoAction } from "@/features/demo";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return runDemoAction(request, (await params).id);
}

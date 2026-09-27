import { proxySharedOutcome } from "../proxy";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return proxySharedOutcome(
    request,
    `/api/shared-outcomes/${encodeURIComponent(id)}`,
  );
}

import { proxySharedOutcome } from "../proxy";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return proxySharedOutcome(`/api/shared-outcomes/${encodeURIComponent(id)}`);
}

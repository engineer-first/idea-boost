import { proxySharedOutcome } from "../../../proxy";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; recordId: string }> },
): Promise<Response> {
  const { id, recordId } = await context.params;
  return proxySharedOutcome(
    `/api/shared-outcomes/${encodeURIComponent(id)}/history/${encodeURIComponent(recordId)}`,
  );
}

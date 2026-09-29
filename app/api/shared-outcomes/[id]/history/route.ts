import { proxySharedOutcome } from "../../proxy";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const cursor = new URL(request.url).searchParams.get("cursor");
  return proxySharedOutcome(
    `/api/shared-outcomes/${encodeURIComponent(id)}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
}

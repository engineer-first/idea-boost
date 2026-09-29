import { proxyCompletedRooms } from "../../../proxy";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; kind: string }> },
): Promise<Response> {
  const { id, kind } = await context.params;
  return proxyCompletedRooms(
    `/api/completed-rooms/${encodeURIComponent(id)}/scenes/${encodeURIComponent(kind)}`,
  );
}

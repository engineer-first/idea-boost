import { proxyCompletedRooms } from "../proxy";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return proxyCompletedRooms(
    `/api/completed-rooms/${encodeURIComponent(id)}`,
    request.signal,
  );
}

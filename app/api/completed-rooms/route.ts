import { proxyCompletedRooms } from "./proxy";
export async function GET(request: Request): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get("cursor");
  return proxyCompletedRooms(
    `/api/completed-rooms${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
}

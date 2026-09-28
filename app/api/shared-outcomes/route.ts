import { proxySharedOutcome } from "./proxy";
export async function GET(request: Request): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get("cursor");
  return proxySharedOutcome(
    `/api/shared-outcomes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
}

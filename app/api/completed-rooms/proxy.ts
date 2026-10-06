import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
export async function proxyCompletedRooms(
  path: string,
  signal?: AbortSignal,
): Promise<Response> {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (!(await getCurrentUser()))
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const response = await apiFetch(path, {
      cache: "no-store",
      ...(signal ? { signal } : {}),
    });
    const body: unknown = await response
      .json()
      .catch(() => ({ error: "unavailable" }));
    return Response.json(body, {
      status: response.status,
      headers,
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}

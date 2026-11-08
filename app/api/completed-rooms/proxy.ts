import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
export async function proxyCompletedRooms(
  path: string,
  signal?: AbortSignal,
  body?: string,
): Promise<Response> {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (!(await getCurrentUser()))
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const init: RequestInit = {
      cache: "no-store",
      ...(signal ? { signal } : {}),
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          }
        : {}),
    };
    const response = body
      ? await apiFetch(path, init, 90000)
      : await apiFetch(path, init);
    const responseBody: unknown = await response
      .json()
      .catch(() => ({ error: "unavailable" }));
    return Response.json(responseBody, {
      status: response.status,
      headers,
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}

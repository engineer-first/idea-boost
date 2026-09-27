import { apiFetch } from "@/lib/api-client";

export async function proxySharedOutcome(
  request: Request,
  path: string,
): Promise<Response> {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer "))
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const response = await apiFetch(path, {
      headers: { Authorization: authorization },
      cache: "no-store",
    });
    return Response.json(await response.json(), {
      status: response.status,
      headers,
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}

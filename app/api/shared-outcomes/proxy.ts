import { apiFetch } from "@/lib/api-client";

export async function proxySharedOutcome(path: string): Promise<Response> {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  try {
    const response = await apiFetch(path, {
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

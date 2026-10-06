import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

// 再接続の可否をHTTPステータスだけで返す。本文と内部的な拒否理由は公開しない。
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  if (!(await getCurrentUser()))
    return new Response(null, { status: 401, headers });
  const { id } = await context.params;
  try {
    const response = await apiFetch(`/api/rooms/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: request.signal,
    });
    await response.body?.cancel();
    return new Response(null, { status: response.status, headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}

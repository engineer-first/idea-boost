import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
export async function GET(request: Request): Promise<Response> {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (!(await getCurrentUser()))
    return Response.json(
      { error: "ログインしてください。" },
      { status: 401, headers },
    );
  try {
    const res = await apiFetch(`/api/feedback${new URL(request.url).search}`, {
      cache: "no-store",
    });
    return Response.json(await res.json(), { status: res.status, headers });
  } catch {
    return Response.json(
      { error: "取得できませんでした。" },
      { status: 503, headers },
    );
  }
}

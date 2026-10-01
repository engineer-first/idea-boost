import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

async function forward(
  method: "GET" | "POST" | "DELETE",
  request: Request,
): Promise<Response> {
  if (!(await getCurrentUser()))
    return Response.json(
      { error: "ログインしてください。" },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  try {
    const response = await apiFetch(
      `/api/admin/access${new URL(request.url).search}`,
      {
        method,
        body: method === "GET" ? undefined : await request.text(),
        headers:
          method === "GET" ? undefined : { "Content-Type": "application/json" },
        cache: "no-store",
      },
    );
    return Response.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "権限情報を取得できませんでした。" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export const GET = (request: Request): Promise<Response> =>
  forward("GET", request);
export const POST = (request: Request): Promise<Response> =>
  forward("POST", request);
export const DELETE = (request: Request): Promise<Response> =>
  forward("DELETE", request);

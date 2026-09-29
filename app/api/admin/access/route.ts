import { apiFetch } from "@/lib/api-client";

async function forward(
  method: "GET" | "POST" | "DELETE",
  request: Request,
): Promise<Response> {
  try {
    const response = await apiFetch("/api/admin/access", {
      method,
      body: method === "GET" ? undefined : await request.text(),
      headers:
        method === "GET" ? undefined : { "Content-Type": "application/json" },
      cache: "no-store",
    });
    return Response.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "権限情報を取得できませんでした。" },
      { status: 503 },
    );
  }
}

export const GET = (request: Request) => forward("GET", request);
export const POST = (request: Request) => forward("POST", request);
export const DELETE = (request: Request) => forward("DELETE", request);

import { ReflectionRequestSchema } from "@/contracts/outcome-reflection";
import { proxyCompletedRooms } from "../../proxy";

type Context = { params: Promise<{ id: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { id } = await context.params;
  return proxyCompletedRooms(
    `/api/completed-rooms/${encodeURIComponent(id)}/reflection${new URL(request.url).search}`,
    request.signal,
  );
}
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "操作元を確認できません。" },
      { status: 403, headers },
    );
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 2048) throw new Error();
    input = JSON.parse(body);
  } catch {
    return Response.json(
      { error: "入力が不正です。" },
      { status: 400, headers },
    );
  }
  const result = ReflectionRequestSchema.safeParse(input);
  if (!result.success)
    return Response.json(
      { error: "入力が不正です。" },
      { status: 400, headers },
    );
  const { id } = await context.params;
  return proxyCompletedRooms(
    `/api/completed-rooms/${encodeURIComponent(id)}/reflection`,
    request.signal,
    JSON.stringify(result.data),
  );
}

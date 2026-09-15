import type { z } from "zod";
import {
  DEMO_HOST,
  DemoActionRequestSchema,
  DemoCreateRequestSchema,
  DemoCreateResponseSchema,
  type DemoStatus,
  DemoStatusSchema,
} from "@/contracts/demo";
import { isUuid } from "@/contracts/ids";
import { TOKEN_AUDIENCE } from "@/contracts/session";
import { apiFetch } from "@/lib/api-client";
import { SESSION_TTL_SECONDS, setSessionCookie } from "@/lib/session/cookie";
import { getCurrentUser } from "@/lib/session/current-user";
import { getSessionSecret } from "@/lib/session/env";
import { signToken } from "@/lib/session/token";

export function isDemoEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.IDEA_BOOST_DEMO === "true" &&
    Boolean(process.env.DEMO_CONTROL_TOKEN)
  );
}

function errorResponse(status: number): Response {
  return Response.json(
    {
      error:
        status === 503
          ? "デモの通信に失敗しました。もう一度お試しください。"
          : "デモ操作を実行できませんでした。状況を再取得してください。",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function isSameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

async function proxyDemo<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<Response> {
  try {
    const response = await apiFetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Demo-Control-Token": process.env.DEMO_CONTROL_TOKEN ?? "",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
    if (!response.ok) return errorResponse(response.status);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) return errorResponse(503);
    return Response.json(parsed.data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return errorResponse(503);
  }
}

export async function createDemoRoom(request: Request): Promise<Response> {
  if (!isDemoEnabled()) return errorResponse(404);
  if (!isSameOrigin(request)) return errorResponse(403);
  const parsed = DemoCreateRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return errorResponse(400);
  try {
    const token = await signToken(DEMO_HOST, {
      secret: getSessionSecret(),
      audience: TOKEN_AUDIENCE.session,
      expiresInSeconds: SESSION_TTL_SECONDS,
    });
    await setSessionCookie(token);
    return await proxyDemo(
      "/api/demo/rooms",
      DemoCreateResponseSchema,
      parsed.data,
    );
  } catch {
    return errorResponse(503);
  }
}

async function authorizeRoom(id: string): Promise<Response | null> {
  if (!isDemoEnabled() || !isUuid(id)) return errorResponse(404);
  const user = await getCurrentUser();
  if (!user) return errorResponse(401);
  if (user.sub !== DEMO_HOST.sub) return errorResponse(403);
  return null;
}

export async function getDemoStatus(id: string): Promise<Response> {
  const denied = await authorizeRoom(id);
  return denied ?? proxyDemo(`/api/demo/rooms/${id}`, DemoStatusSchema);
}

export async function runDemoAction(
  request: Request,
  id: string,
): Promise<Response> {
  const denied = await authorizeRoom(id);
  if (denied) return denied;
  if (!isSameOrigin(request)) return errorResponse(403);
  const parsed = DemoActionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return errorResponse(400);
  return proxyDemo(
    `/api/demo/rooms/${id}/actions`,
    DemoStatusSchema,
    parsed.data,
  );
}

export async function getInitialDemoStatus(
  id: string,
): Promise<DemoStatus | null> {
  if (!isDemoEnabled()) return null;
  const response = await getDemoStatus(id);
  return response.ok ? DemoStatusSchema.parse(await response.json()) : null;
}

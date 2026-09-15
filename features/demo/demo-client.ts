import type { z } from "zod";

export async function demoRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(new URL(path, window.location.origin), {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      "デモ操作に失敗しました。状況を確認して、もう一度お試しください。",
    );
  return schema.parse(await response.json());
}

export const DEMO_REQUEST_ERROR =
  "デモ操作に失敗しました。状況を確認して、もう一度お試しください。";

import type { z } from "zod";

export async function verificationRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok)
    throw new Error(
      "検証操作に失敗しました。ログインと接続を確認して再取得してください。",
    );
  return schema.parse(await response.json());
}

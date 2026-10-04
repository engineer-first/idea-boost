import { proxySharedOutcome } from "./proxy";
export async function GET(request: Request): Promise<Response> {
  const source = new URL(request.url).searchParams;
  const params = new URLSearchParams();
  for (const key of ["q", "status", "phase", "saveStatus", "cursor"]) {
    const value = source.get(key);
    if (value !== null) params.set(key, value);
  }
  return proxySharedOutcome(
    `/api/shared-outcomes${params.size ? `?${params}` : ""}`,
  );
}

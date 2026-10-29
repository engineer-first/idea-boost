import { importPKCS8, SignJWT } from "jose";
import { syncPbiPriority } from "../../.github/scripts/sync-pbi-priority.js";

export interface PrioritySyncEnv {
  ISSUE_PROJECT_APP_CLIENT_ID: string;
  ISSUE_PROJECT_APP_PRIVATE_KEY: string;
}

/** Used by the cron handler and the local HTTP simulation with synthetic credentials. */
export async function runPrioritySync(
  env: PrioritySyncEnv,
  fetcher: typeof fetch = fetch,
): Promise<Awaited<ReturnType<typeof syncPbiPriority>>> {
  const deadline = AbortSignal.timeout(240_000);
  const key = await importPKCS8(env.ISSUE_PROJECT_APP_PRIVATE_KEY, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(env.ISSUE_PROJECT_APP_CLIENT_ID)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 540)
    .sign(key);

  async function request(
    path: string,
    token: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetcher(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "idea-boost-pbi-priority",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]),
    });
    // Never put response bodies, JWTs or installation tokens in errors/logs.
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`GitHub HTTP ${response.status} (${path})`);
    }
    return response;
  }

  const installation = await (
    await request("/repos/engineer-first/idea-boost/installation", jwt)
  ).json<{ id: number }>();
  if (!Number.isSafeInteger(installation.id))
    throw new Error("GitHub installation missing");
  const credentials = await (
    await request(`/app/installations/${installation.id}/access_tokens`, jwt, {
      method: "POST",
      body: JSON.stringify({
        repositories: ["idea-boost"],
        permissions: { issues: "read", organization_projects: "write" },
      }),
    })
  ).json<{ token: string }>();
  if (!credentials.token) throw new Error("GitHub installation token missing");
  try {
    return await syncPbiPriority({
      dryRun: false,
      graphql: async (query, variables) => {
        const response = await request("/graphql", credentials.token, {
          method: "POST",
          body: JSON.stringify({ query, variables }),
        });
        const result = await response.json<{
          data?: unknown;
          errors?: unknown[];
        }>();
        if (result.errors?.length || !result.data)
          throw new Error("GitHub GraphQL failed");
        return result.data;
      },
    });
  } finally {
    // Revocation must still run if the sync deadline has expired.
    try {
      const response = await fetcher(
        "https://api.github.com/installation/token",
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${credentials.token}`,
            "User-Agent": "idea-boost-pbi-priority",
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      await response.body?.cancel();
      if (!response.ok)
        console.warn({
          event: "pbi_priority_token_revoke_failed",
          status: response.status,
        });
    } catch {
      console.warn({ event: "pbi_priority_token_revoke_failed" });
    }
  }
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: PrioritySyncEnv,
  ): Promise<void> {
    const result = await runPrioritySync(env);
    console.info({
      event: "pbi_priority_synced",
      scheduledTime: controller.scheduledTime,
      ...result,
    });
  },
} satisfies ExportedHandler<PrioritySyncEnv>;

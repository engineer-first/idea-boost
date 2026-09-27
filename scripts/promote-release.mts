import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const repository = "engineer-first/idea-boost";
const Commit = z.string().regex(/^[0-9a-f]{40}$/);

export type PromotionApi = (
  method: "GET" | "PATCH" | "POST",
  path: string,
  data?: Record<string, unknown>,
) => Promise<unknown>;

function requireCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

/** PRのheadだけを、releaseの非強制fast-forwardで公開対象にする。 */
export async function promoteRelease(
  prNumber: number,
  expectedSha: string,
  api: PromotionApi,
): Promise<void> {
  z.number().int().positive().parse(prNumber);
  Commit.parse(expectedSha);
  const pr = z
    .object({
      state: z.literal("open"),
      draft: z.boolean().optional(),
      head: z.object({
        ref: z.literal("develop"),
        sha: Commit,
        repo: z.object({ full_name: z.literal(repository) }),
      }),
      base: z.object({
        ref: z.literal("release"),
        repo: z.object({ full_name: z.literal(repository) }),
      }),
    })
    .parse(await api("GET", `/pulls/${prNumber}`));
  requireCondition(!pr.draft, "Draft PRは公開できません。");
  requireCondition(
    pr.head.sha === expectedSha,
    "PRのheadがこのActions実行のdevelopと一致しません。再実行してください。",
  );
  const develop = z
    .object({ object: z.object({ sha: Commit }) })
    .parse(await api("GET", "/git/ref/heads/develop"));
  const release = z
    .object({ object: z.object({ sha: Commit }) })
    .parse(await api("GET", "/git/ref/heads/release"));
  requireCondition(
    develop.object.sha === expectedSha,
    "developがこのActions実行後に更新されました。新しいPRとActionsで確認してください。",
  );
  const comparison = z
    .object({
      status: z.string(),
      base_commit: z.object({ sha: Commit }),
      head_commit: z.object({ sha: Commit }),
    })
    .parse(await api("GET", "/compare/release...develop"));
  requireCondition(
    comparison.status === "ahead" &&
      comparison.base_commit.sha === release.object.sha &&
      comparison.head_commit.sha === expectedSha,
    "releaseからdevelopへfast-forwardできません。ブランチ履歴を確認してください。",
  );
  await api("PATCH", "/git/refs/heads/release", {
    sha: expectedSha,
    force: false,
  });
  // GITHUB_TOKENによるpushはpushイベントのDeployを起動しないため、明示的にdispatchする。
  await api("POST", "/actions/workflows/deploy.yml/dispatches", {
    ref: "release",
  });
}

export const promotionApi: PromotionApi = async (method, path, data) => {
  const token = process.env.GH_TOKEN;
  requireCondition(token, "GH_TOKENが設定されていません。");
  const response = await fetch(
    `https://api.github.com/repos/${repository}${path}`,
    {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub API ${method} ${path} に失敗しました（HTTP ${response.status}）。`,
    );
  }
  const body = await response.text();
  return body ? JSON.parse(body) : null;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    requireCondition(
      process.env.GITHUB_REPOSITORY === repository,
      "想定外のリポジトリです。",
    );
    const [prNumber, expectedSha] = process.argv.slice(2);
    await promoteRelease(Number(prNumber), expectedSha, promotionApi);
    const summary = [
      `releaseを ${expectedSha} へfast-forwardしました。`,
      `PR: https://github.com/${repository}/pull/${prNumber}`,
      `Deploy: https://github.com/${repository}/actions/workflows/deploy.yml`,
    ].join("\n");
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

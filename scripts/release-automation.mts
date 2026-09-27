import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  assertRecordedDeployments,
  type GitHubApi,
  githubApi,
  prepareRelease,
  recordActions,
  recordRelease,
} from "./release-history.mts";

/** workflowの入力は環境変数/引数として受け取り、シェルコードとして展開しない。 */
export async function executeAutomation(
  args: string[],
  env: Record<string, string | undefined>,
  api: GitHubApi,
): Promise<string> {
  const [command, ...rest] = args;
  if (command === "prepare" && rest.length === 1) {
    await assertRecordedDeployments(
      api,
      env.GITHUB_RUN_ID ? Number(env.GITHUB_RUN_ID) : undefined,
      env.GITHUB_RUN_ATTEMPT ? Number(env.GITHUB_RUN_ATTEMPT) : 1,
    );
    const plan = await prepareRelease(rest[0], api);
    return [
      "## リリースノートの下書き（未公開）",
      "",
      `対象commit：${plan.commit}`,
      `比較元：${plan.previousCommit}`,
      "",
      ...plan.changes.map(
        (change) =>
          `- **${change.kind}**：${change.text}（${change.prs.map((pr) => `[#${pr}](https://github.com/engineer-first/idea-boost/pull/${pr})`).join("、")}）`,
      ),
      "",
      ...plan.notices.map((notice) => `- 利用上の注意：${notice}`),
    ].join("\n");
  }
  if (
    command === "actions" &&
    (rest.length === 2 || (rest.length === 3 && rest[2] === "--publish"))
  ) {
    const result = await recordActions(
      Number(rest[0]),
      Number(rest[1]),
      api,
      rest[2] === "--publish",
    );
    return `${result.body}\n${result.url ? `[公開履歴](${result.url})` : "プレビューのみ"}`;
  }
  if (
    command === "retry" &&
    (rest.length === 0 || (rest.length === 1 && rest[0] === "--publish"))
  ) {
    const {
      RUN_ID: runId,
      RUN_ATTEMPT: attempt,
      RELEASE_NOTE_JSON: json,
    } = env;
    if (runId && attempt && !json)
      return executeAutomation(["actions", runId, attempt, ...rest], env, api);
    if (json && !runId && !attempt) {
      const note: unknown = JSON.parse(json);
      if (
        !note ||
        typeof note !== "object" ||
        !("deployment" in note) ||
        !note.deployment ||
        typeof note.deployment !== "object" ||
        !("kind" in note.deployment) ||
        !["manual", "actions"].includes(String(note.deployment.kind))
      ) {
        throw new Error(
          "履歴補完には成功確認付きのmanual/actions receiptが必要です。",
        );
      }
      const result = await recordRelease(note, api, rest[0] === "--publish");
      return `${result.body}\n${result.url ? `[公開履歴](${result.url})` : "プレビューのみ"}`;
    }
    throw new Error(
      "run IDとattempt、または手動receiptのどちらか一方を指定してください。",
    );
  }
  throw new Error(
    "Usage: release-automation.mts prepare <SHA> | actions <run ID> <attempt> [--publish] | retry [--publish]",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const output = await executeAutomation(
      process.argv.slice(2),
      process.env,
      githubApi,
    );
    console.log(output);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${output}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

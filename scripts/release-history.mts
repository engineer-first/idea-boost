import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const REPOSITORY = "engineer-first/idea-boost";
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
// 記録導入前に確認できた直近の成功した Deploy。全過去版の復元はしない。
export const BASELINE_COMMIT = "24fc6570bcf80ad641e8160a15aa23d6e31e6439";
const BASELINE_TIME = "2026-09-23T01:50:15Z";
const Commit = z.string().regex(/^[0-9a-f]{40}$/);
const UtcTime = z
  .string()
  .datetime()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
const Text = z.string().trim().min(1);
const Deployment = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("actions"),
      runId: z.number().int().positive(),
      attempt: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("manual"),
      completedAt: UtcTime,
      evidenceUrl: z
        .string()
        .regex(
          /^https:\/\/github\.com\/engineer-first\/idea-boost\/(issues|pull)\/\d+(#[-\w]+)?$/,
        ),
      migration: z.literal(true),
      api: z.literal(true),
      app: z.literal(true),
      health: z.literal(true),
    })
    .strict(),
]);
const Note = z
  .object({
    commit: Commit,
    previousCommit: Commit,
    deployment: Deployment,
    changes: z
      .array(
        z
          .object({
            kind: z.enum(["追加", "変更", "修正", "内部変更"]),
            text: Text,
            prs: z.array(z.number().int().positive()).min(1),
          })
          .strict(),
      )
      .min(1),
    notices: z.array(Text),
  })
  .strict();
const Metadata = z
  .object({
    tag: z.string().startsWith("prod-"),
    commit: Commit,
    previousCommit: Commit,
    deployedAt: UtcTime,
    evidenceUrl: z.string().url(),
  })
  .strict();
type Metadata = z.infer<typeof Metadata>;
const Release = z.object({
  tag_name: z.string(),
  body: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  html_url: z.string().url(),
});
type Release = z.infer<typeof Release>;
export type GitHubApi = (
  method: "GET" | "POST",
  path: string,
  data?: Record<string, unknown>,
) => Promise<unknown>;
export type ReleaseResult = {
  tag: string;
  body: string;
  existing: boolean;
  url?: string;
};

function requireCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

async function deploymentMetadata(
  note: z.infer<typeof Note>,
  api: GitHubApi,
): Promise<Metadata> {
  const deployment = note.deployment;
  if (deployment.kind === "manual") {
    return {
      tag: `prod-manual-${deployment.completedAt.replaceAll(/[-:]/g, "")}`,
      commit: note.commit,
      previousCommit: note.previousCommit,
      deployedAt: deployment.completedAt,
      evidenceUrl: deployment.evidenceUrl,
    };
  }
  const path = `/actions/runs/${deployment.runId}/attempts/${deployment.attempt}`;
  const run = z
    .object({
      id: z.number(),
      run_attempt: z.number(),
      head_sha: Commit,
      path: z.literal(".github/workflows/deploy.yml"),
      event: z.literal("push"),
      head_branch: z.literal("release"),
      status: z.literal("completed"),
      conclusion: z.literal("success"),
    })
    .parse(await api("GET", path));
  requireCondition(
    run.id === deployment.runId &&
      run.run_attempt === deployment.attempt &&
      run.head_sha === note.commit,
    "Deploy の実行・試行・commit が下書きと一致しません。",
  );
  const jobs = z
    .object({
      total_count: z.number(),
      jobs: z.array(
        z.object({
          name: z.string(),
          conclusion: z.string().nullable(),
          completed_at: z.string().nullable(),
        }),
      ),
    })
    .parse(await api("GET", `${path}/jobs?per_page=100&page=1`));
  requireCondition(
    jobs.total_count === jobs.jobs.length,
    "Deploy のジョブをすべて取得できませんでした。",
  );
  for (const name of ["gate", "deploy-api", "deploy-app", "health-check"]) {
    const matches = jobs.jobs.filter((job) => job.name === name);
    requireCondition(
      matches.length === 1 && matches[0].conclusion === "success",
      `${name} の成功を確認できません。`,
    );
  }
  const health = jobs.jobs.find((job) => job.name === "health-check");
  return {
    tag: `prod-actions-${deployment.runId}-${deployment.attempt}`,
    commit: note.commit,
    previousCommit: note.previousCommit,
    deployedAt: UtcTime.parse(health?.completed_at),
    evidenceUrl: `${REPOSITORY_URL}/actions/runs/${deployment.runId}/attempts/${deployment.attempt}`,
  };
}

function metadataOf(release: Release): Metadata {
  const matches = [
    ...(release.body ?? "").matchAll(/<!-- release-history (.+) -->/g),
  ];
  requireCondition(
    matches.length === 1,
    `${release.tag_name} の識別情報が不正です。履歴を確認してください。`,
  );
  const metadata = Metadata.parse(JSON.parse(matches[0][1]));
  requireCondition(
    metadata.tag === release.tag_name,
    "版と識別情報が一致しません。",
  );
  return metadata;
}

async function releases(api: GitHubApi): Promise<Release[]> {
  const result: Release[] = [];
  for (let page = 1; ; page++) {
    const batch = z
      .array(Release)
      .parse(await api("GET", `/releases?per_page=100&page=${page}`));
    result.push(
      ...batch.filter((release) => release.tag_name.startsWith("prod-")),
    );
    if (batch.length < 100) return result;
  }
}

function render(
  note: z.infer<typeof Note>,
  metadata: Metadata,
  first: boolean,
): string {
  const changes = note.changes.map(
    (change) =>
      `- **${change.kind}**：${change.text}\n  関連PR：${change.prs.map((pr) => `[#${pr}](${REPOSITORY_URL}/pull/${pr})`).join("、")}`,
  );
  return [
    `# ${metadata.tag}`,
    "",
    `本番公開日時（UTC）：${metadata.deployedAt}`,
    "",
    ...changes,
    "",
    ...(note.notices.length
      ? [
          "## 利用上の注意",
          "",
          ...note.notices.map((notice) => `- ${notice}`),
          "",
        ]
      : []),
    `[公開commit](${REPOSITORY_URL}/commit/${metadata.commit}) ／ [前回との差分](${REPOSITORY_URL}/compare/${metadata.previousCommit}...${metadata.commit})`,
    "",
    `[${note.deployment.kind === "actions" ? "本番Deployの成功記録" : "手動デプロイの確認証跡"}](${metadata.evidenceUrl})`,
    ...(first
      ? [
          "",
          `記録開始基準：${BASELINE_TIME} の本番commit ${BASELINE_COMMIT}。これ以前の全リリース履歴は収録していません。`,
        ]
      : []),
    "",
    `<!-- release-history ${JSON.stringify(metadata)} -->`,
    "",
  ].join("\n");
}

/** 既定は読取とプレビューのみ。publish=true だけが Release を作成する。 */
export async function recordRelease(
  input: unknown,
  api: GitHubApi,
  publish: boolean,
): Promise<ReleaseResult> {
  const note = Note.parse(input);
  const metadata = await deploymentMetadata(note, api);
  requireCondition(
    Date.parse(metadata.deployedAt) > Date.parse(BASELINE_TIME) &&
      Date.parse(metadata.deployedAt) <= Date.now(),
    "本番公開日時は記録開始基準より後、現在以前である必要があります。",
  );
  const history = await releases(api);
  const existing = history.find((release) => release.tag_name === metadata.tag);
  const reference = await api("GET", `/git/ref/tags/${metadata.tag}`);
  const tag = reference
    ? z
        .object({ sha: Commit })
        .parse(await api("GET", `/commits/${metadata.tag}`))
    : null;
  requireCondition(
    !tag || tag.sha === note.commit,
    "既存の版が別のcommitを指しています。タグは変更しません。",
  );
  if (existing) {
    requireCondition(
      !existing.draft && !existing.prerelease && tag,
      "同じ版が未公開またはタグ不整合です。手動で確認してください。",
    );
    requireCondition(
      JSON.stringify(metadataOf(existing)) === JSON.stringify(metadata),
      "同じ版の公開情報が一致しません。",
    );
    return {
      tag: metadata.tag,
      body: existing.body ?? "",
      existing: true,
      url: existing.html_url,
    };
  }
  requireCondition(
    history.every((release) => !release.draft && !release.prerelease),
    "未公開の prod- 版があります。先に確認してください。",
  );
  const previous = history
    .map(metadataOf)
    .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))[0];
  requireCondition(
    note.previousCommit === (previous?.commit ?? BASELINE_COMMIT),
    "前回の本番commitと一致しません。未記録の版から順に記録してください。",
  );
  requireCondition(
    !previous || metadata.deployedAt > previous.deployedAt,
    "前回より古い日時の版は追加できません。",
  );
  if (previous) {
    const previousTag = z
      .object({ sha: Commit })
      .parse(await api("GET", `/commits/${previous.tag}`));
    requireCondition(
      previousTag.sha === previous.commit,
      "前回のタグが移動されています。履歴を確認してください。",
    );
  }
  const comparison = z
    .object({ status: z.enum(["ahead", "identical", "behind", "diverged"]) })
    .parse(
      await api("GET", `/compare/${note.previousCommit}...${note.commit}`),
    );
  requireCondition(
    ["ahead", "identical"].includes(comparison.status),
    "巻き戻し・分岐したcommitです。通常リリースとして記録せず、運用手順を確認してください。",
  );
  const body = render(note, metadata, !previous);
  if (!publish) return { tag: metadata.tag, body, existing: false };
  const created = Release.parse(
    await api("POST", "/releases", {
      tag_name: metadata.tag,
      target_commitish: note.commit,
      name: metadata.tag,
      body,
      draft: false,
      prerelease: false,
      make_latest: "false",
    }),
  );
  return { tag: metadata.tag, body, existing: false, url: created.html_url };
}

const githubApi: GitHubApi = async (method, path, data) => {
  try {
    const args = [
      "api",
      "--hostname",
      "github.com",
      "--method",
      method,
      `repos/${REPOSITORY}${path}`,
    ];
    if (data) args.push("--input", "-");
    return JSON.parse(
      execFileSync("gh", args, {
        encoding: "utf8",
        input: data ? JSON.stringify(data) : undefined,
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
  } catch (error) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? String(error.stderr)
        : "";
    if (
      method === "GET" &&
      path.startsWith("/git/ref/tags/prod-") &&
      stderr.includes("(HTTP 404)")
    )
      return null;
    throw new Error(`GitHub API ${method} ${path} に失敗しました。${stderr}`, {
      cause: error,
    });
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [file, flag, ...rest] = process.argv.slice(2);
  if (!file || (flag !== undefined && flag !== "--publish") || rest.length) {
    console.error(
      "Usage: npm run release:record -- <reviewed-note.json> [--publish]",
    );
    process.exitCode = 1;
  } else {
    try {
      const result = await recordRelease(
        JSON.parse(readFileSync(file, "utf8")),
        githubApi,
        flag === "--publish",
      );
      console.log(result.body);
      console.error(
        result.url ??
          "プレビューのみ。公開する場合はレビュー後に --publish を指定してください。",
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}

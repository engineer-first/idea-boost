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
        )
        .optional(),
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
    mode: z.enum(["release", "redeploy", "rollback"]).default("release"),
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
export const ReleasePlan = Note.omit({ commit: true, deployment: true });
export type PreparedRelease = z.infer<typeof ReleasePlan> & { commit: string };

const Metadata = z
  .object({
    tag: z.string().startsWith("prod-"),
    commit: Commit,
    previousCommit: Commit,
    deployedAt: UtcTime,
    evidenceUrl: z.string().url().optional(),
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
      ...(deployment.evidenceUrl
        ? { evidenceUrl: deployment.evidenceUrl }
        : {}),
    };
  }
  const evidence = await inspectDeployment(
    deployment.runId,
    deployment.attempt,
    api,
  );
  requireCondition(
    evidence.commit === note.commit,
    "Deploy のcommitが下書きと一致しません。",
  );
  return { ...evidence, previousCommit: note.previousCommit };
}

class IncompleteDeploymentError extends Error {}

/** 再試行されなかった成功ジョブを引き継ぎ、再試行されたジョブは新しい結果を使う。 */
export async function inspectDeployment(
  runId: number,
  attempt: number,
  api: GitHubApi,
): Promise<Omit<Metadata, "previousCommit">> {
  z.number().int().positive().parse(runId);
  z.number().int().min(1).max(51).parse(attempt);
  const run = z
    .object({
      id: z.number(),
      run_attempt: z.number(),
      head_sha: Commit,
      path: z.literal(".github/workflows/deploy.yml"),
      event: z.enum(["push", "workflow_dispatch"]),
      head_branch: z.literal("release"),
      status: z.enum(["completed", "in_progress"]),
    })
    .parse(await api("GET", `/actions/runs/${runId}/attempts/${attempt}`));
  requireCondition(
    run.id === runId && run.run_attempt === attempt,
    "Deploy の実行・試行が一致しません。",
  );
  const Job = z.object({
    name: z.string(),
    conclusion: z.string().nullable(),
    completed_at: z.string().nullable(),
  });
  type Job = z.infer<typeof Job> & { attempt: number };
  const latest = new Map<string, Job>();
  const healthChecks: Job[] = [];
  for (let current = 1; current <= attempt; current++) {
    const jobs = z
      .object({ total_count: z.number(), jobs: z.array(Job) })
      .parse(
        await api(
          "GET",
          `/actions/runs/${runId}/attempts/${current}/jobs?per_page=100&page=1`,
        ),
      );
    requireCondition(
      jobs.total_count === jobs.jobs.length,
      "Deploy のジョブをすべて取得できませんでした。",
    );
    for (const name of ["gate", "deploy-api", "deploy-app", "health-check"]) {
      const matches = jobs.jobs.filter((job) => job.name === name);
      requireCondition(matches.length <= 1, `${name} が複数あります。`);
      if (matches[0]) {
        const job = { ...matches[0], attempt: current };
        latest.set(name, job);
        if (name === "health-check") healthChecks.push(job);
      }
    }
  }
  for (const name of ["gate", "deploy-api", "deploy-app", "health-check"]) {
    if (latest.get(name)?.conclusion !== "success")
      throw new IncompleteDeploymentError(`${name} の成功を確認できません。`);
  }
  const apiJob = latest.get("deploy-api");
  const appJob = latest.get("deploy-app");
  requireCondition(apiJob && appJob, "本番の公開ジョブがありません。");
  const finishedAt = Math.max(
    ...["gate", "deploy-api", "deploy-app"].map((name) =>
      Date.parse(UtcTime.parse(latest.get(name)?.completed_at)),
    ),
  );
  // healthだけ再確認しても、新たなデプロイがなければ版と元の公開日時を変えない。
  const health = healthChecks.find(
    (job) =>
      job.conclusion === "success" &&
      Date.parse(UtcTime.parse(job.completed_at)) >= finishedAt,
  );
  if (!health)
    throw new IncompleteDeploymentError(
      "最新のデプロイ後のhealth成功を確認できません。",
    );
  return {
    tag: `prod-actions-${runId}-${Math.max(apiJob.attempt, appJob.attempt)}`,
    commit: run.head_sha,
    deployedAt: UtcTime.parse(health.completed_at),
    evidenceUrl: `${REPOSITORY_URL}/actions/runs/${runId}/attempts/${health.attempt}`,
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

/** 成功したのに未記録のDeployを残したまま、次の本番へ進まない。 */
export async function assertRecordedDeployments(
  api: GitHubApi,
  currentRunId?: number,
  currentAttempt = 1,
): Promise<void> {
  const recorded = (await releases(api))
    .filter((release) => !release.draft && !release.prerelease)
    .map(metadataOf);
  for (let page = 1; ; page++) {
    const result = z
      .object({
        workflow_runs: z.array(
          z.object({
            id: z.number(),
            run_attempt: z.number(),
            status: z.string(),
            updated_at: UtcTime,
          }),
        ),
      })
      .parse(
        await api(
          "GET",
          `/actions/workflows/deploy.yml/runs?branch=release&per_page=100&page=${page}`,
        ),
      );
    for (const run of result.workflow_runs) {
      if (run.updated_at <= BASELINE_TIME) continue;
      if (run.id === currentRunId) {
        if (currentAttempt <= 1) continue;
        run.run_attempt = currentAttempt - 1;
        run.status = "completed";
      }
      if (
        currentRunId !== undefined &&
        ["queued", "waiting", "requested", "pending"].includes(run.status)
      )
        continue;
      requireCondition(
        run.status === "completed",
        "他のDeployが実行・待機中です。",
      );
      if (
        recorded.some(
          (item) => item.tag === `prod-actions-${run.id}-${run.run_attempt}`,
        )
      )
        continue;
      let evidence: Omit<Metadata, "previousCommit">;
      try {
        evidence = await inspectDeployment(run.id, run.run_attempt, api);
      } catch (error) {
        if (error instanceof IncompleteDeploymentError) continue;
        throw error;
      }
      if (evidence.deployedAt <= BASELINE_TIME) continue;
      requireCondition(
        recorded.some(
          (item) =>
            item.tag === evidence.tag &&
            item.commit === evidence.commit &&
            item.deployedAt === evidence.deployedAt,
        ),
        `成功したDeploy ${run.id} / attempt ${run.run_attempt} が未記録です。Record Releaseで記録だけを先に回復してください。`,
      );
    }
    if (result.workflow_runs.length < 100) return;
  }
}

/** 計画は対象commitから読み、PRのマージ方式に依存せず実際の公開SHAと結び付ける。 */
export async function prepareRelease(
  commit: string,
  api: GitHubApi,
): Promise<PreparedRelease> {
  Commit.parse(commit);
  const file = z
    .object({ encoding: z.literal("base64"), content: z.string() })
    .parse(
      await api("GET", `/contents/.github/release-note.json?ref=${commit}`),
    );
  const plan = ReleasePlan.parse(
    JSON.parse(Buffer.from(file.content, "base64").toString("utf8")),
  );
  const history = await releases(api);
  requireCondition(
    history.every((release) => !release.draft && !release.prerelease),
    "未公開の prod- 版があります。",
  );
  const previous = history
    .map(metadataOf)
    .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))[0];
  const previousCommit = previous?.commit ?? BASELINE_COMMIT;
  if (previousCommit === commit) {
    return {
      ...plan,
      commit,
      previousCommit,
      mode: "redeploy",
      changes: [
        {
          kind: "内部変更",
          text: "同じcommitを再公開しました。利用者の機能・操作に変更はありません。",
          prs: [...new Set(plan.changes.flatMap((change) => change.prs))],
        },
      ],
    };
  }
  requireCondition(
    plan.previousCommit === previousCommit,
    "計画の比較元が直前の本番commitと一致しません。未記録の版または古い計画を確認してください。",
  );
  requireCondition(
    plan.mode !== "redeploy",
    "再公開には直前と同じcommitを指定してください。",
  );
  const comparison = z
    .object({ status: z.string() })
    .parse(await api("GET", `/compare/${previousCommit}...${commit}`));
  requireCondition(
    comparison.status === "ahead" || plan.mode === "rollback",
    "巻き戻し・分岐は rollback を明示してください。",
  );
  requireCondition(
    plan.mode !== "rollback" || plan.notices.length > 0,
    "ロールバックには利用上の注意が必要です。",
  );
  return { ...plan, commit };
}

/** Deploy後または記録だけの再試行に使用。本番デプロイ自体は行わない。 */
export async function recordActions(
  runId: number,
  attempt: number,
  api: GitHubApi,
  publish: boolean,
): Promise<ReleaseResult> {
  const evidence = await inspectDeployment(runId, attempt, api);
  const history = await releases(api);
  const existing = history.find((release) => release.tag_name === evidence.tag);
  if (existing) {
    const metadata = metadataOf(existing);
    requireCondition(
      !existing.draft &&
        !existing.prerelease &&
        Object.entries(evidence).every(
          ([key, value]) => metadata[key as keyof Metadata] === value,
        ),
      "記録済みの公開情報と一致しません。",
    );
    const ref = await api("GET", `/git/ref/tags/${evidence.tag}`);
    const tag = z
      .object({ sha: Commit })
      .parse(await api("GET", `/commits/${evidence.tag}`));
    requireCondition(
      ref && tag.sha === evidence.commit,
      "記録済みのタグとcommitが一致しません。",
    );
    return {
      tag: evidence.tag,
      body: existing.body ?? "",
      existing: true,
      url: existing.html_url,
    };
  }
  const plan = await prepareRelease(evidence.commit, api);
  return recordRelease(
    { ...plan, deployment: { kind: "actions", runId, attempt } },
    api,
    publish,
  );
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
    ...(note.mode === "rollback"
      ? ["公開種別：ロールバック"]
      : note.mode === "redeploy"
        ? ["公開種別：同一commitの再公開"]
        : []),
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
    `[公開commit](${REPOSITORY_URL}/commit/${metadata.commit}) ／ [前回との差分](${REPOSITORY_URL}/compare/${metadata.previousCommit}${note.mode === "rollback" ? ".." : "..."}${metadata.commit})`,
    "",
    ...(metadata.evidenceUrl
      ? [
          `[${note.deployment.kind === "actions" ? "本番Deployの成功記録" : "手動デプロイの確認証跡"}](${metadata.evidenceUrl})`,
        ]
      : [
          "手動デプロイの成功確認：migration・API・App・health 完了後のreceiptに基づきます。",
        ]),
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
  requireCondition(
    note.mode !== "rollback" || note.notices.length > 0,
    "ロールバックには利用上の注意が必要です。",
  );
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
      Object.entries(metadataOf(existing)).every(
        ([key, value]) => metadata[key as keyof Metadata] === value,
      ),
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
    ["ahead", "identical"].includes(comparison.status) ||
      note.mode === "rollback",
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

export const githubApi: GitHubApi = async (method, path, data) => {
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
        maxBuffer: 8 * 1024 * 1024,
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

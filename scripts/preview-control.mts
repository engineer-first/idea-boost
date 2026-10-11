import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { unstable_readConfig } from "wrangler";
import { z } from "zod";
import { assertPreviewArtifact } from "./preview-bundle.mts";
import {
  isCurrentSuccessfulCi,
  type PreviewCiRun,
  selectPreviewArtifact,
} from "./preview-ci.mts";
import {
  assertPreviewConfig,
  previewApiConfig,
  previewAppConfig,
  previewMigrationConfig,
} from "./preview-config.mts";
import { previewGenerationState } from "./preview-generation.mts";
import {
  type PreviewRuntime,
  previewComment,
  reconcilePreview,
} from "./preview-lifecycle.mts";
import {
  previewMigrationHash,
  previewSchemaMessage,
} from "./preview-migrations.mts";
import { createPreviewResources } from "./preview-resources.mts";
import { previewProbeToken, previewSessionSecret } from "./preview-secrets.mts";

const repository = "engineer-first/idea-boost";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const prSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(["open", "closed"]),
  head: z.object({
    sha: shaSchema,
    repo: z.object({ full_name: z.string() }).nullable(),
  }),
});
function gh(path: string, body?: unknown): unknown {
  const args = ["api", `repos/${repository}/${path}`];
  if (body !== undefined) args.push("--method", "POST", "--input", "-");
  return JSON.parse(
    execFileSync("gh", args, {
      input: body === undefined ? undefined : JSON.stringify(body),
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }),
  );
}
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Preview設定 ${name} が必要です。`);
  return value;
}
function cli(args: string[], targetOverride?: string): string {
  required("CLOUDFLARE_API_TOKEN");
  required("CLOUDFLARE_ACCOUNT_ID");
  const nameIndex = args.indexOf("--name");
  const target =
    targetOverride ??
    (nameIndex >= 0
      ? `idea-boost-preview-app/${args[nameIndex + 1]}`
      : args[0] === "d1"
        ? "idea-boost-preview-lobby"
        : "idea-boost-preview-api");
  const operation =
    args[0] === "preview" && args[1] === "delete" ? "preview delete" : args[0];
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      operation,
      target,
      state: "started",
    }),
  );
  try {
    const output = execFileSync(process.execPath, [wrangler, ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        operation,
        target,
        state: "succeeded",
      }),
    );
    return output;
  } catch {
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        operation,
        target,
        state: "failed",
      }),
    );
    throw new Error(
      "WranglerのPreview操作に失敗しました。設定・権限を確認してください（秘密を含み得る生ログは転記しません）。",
    );
  }
}
function resources() {
  const production = unstable_readConfig({
    config: resolve(root, "workers/wrangler.jsonc"),
  });
  return createPreviewResources({
    accountId: required("CLOUDFLARE_ACCOUNT_ID"),
    token: required("CLOUDFLARE_API_TOKEN"),
    protectedDatabaseIds: [
      ...production.d1_databases.map(
        (db: { database_id?: string }) => db.database_id ?? "",
      ),
      required("PREVIEW_SHARED_D1_ID"),
    ],
  });
}
function withSecrets<T>(
  operation: (file: string) => T,
  number?: number,
  databaseId?: string,
): T {
  const dir = mkdtempSync(resolve(tmpdir(), "idea-boost-preview-"));
  const file = resolve(dir, "secrets.json");
  try {
    const values = Object.fromEntries(
      [
        "SESSION_SECRET",
        "PREVIEW_PROBE_TOKEN",
        "PREVIEW_ALLOWED_EMAILS",
        "PREVIEW_ACCESS_ISSUER",
        "PREVIEW_ACCESS_AUD",
      ].map((key) => [key, required(key)]),
    );
    if (
      values.SESSION_SECRET.length < 32 ||
      values.PREVIEW_PROBE_TOKEN.length < 32
    )
      throw new Error("Previewの秘密は32文字以上が必要です。");
    if (number !== undefined) {
      if (!databaseId) throw new Error("PR専用D1を確認できません。");
      values.SESSION_SECRET = previewSessionSecret(
        values.SESSION_SECRET,
        number,
        databaseId,
      );
      values.PREVIEW_PROBE_TOKEN = previewProbeToken(
        values.PREVIEW_PROBE_TOKEN,
        number,
      );
    }
    writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
    return operation(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const marker = "<!-- idea-boost-workers-preview -->";
const healthRetryDelays = [1000, 2000, 5000, 10000, 20000, 30000, 60000];
let healthPublication:
  | { sha: string; stillCurrent: () => Promise<boolean> }
  | undefined;
function generationState(number: number): {
  generation: number;
  createdAt?: string;
} {
  const events: unknown[] = [];
  for (let page = 1; ; page++) {
    const batch = z
      .array(z.unknown())
      .parse(gh(`issues/${number}/events?per_page=100&page=${page}`));
    events.push(...batch);
    if (batch.length < 100) break;
  }
  return previewGenerationState(events);
}
function generation(number: number): number {
  return generationState(number).generation;
}
function comments(
  number: number,
): Array<{ id: number; body: string; user: { login: string } }> {
  const result: Array<{ id: number; body: string; user: { login: string } }> =
    [];
  for (let page = 1; ; page++) {
    const batch = z
      .array(
        z.object({
          id: z.number(),
          body: z.string(),
          user: z.object({ login: z.string() }),
        }),
      )
      .parse(gh(`issues/${number}/comments?per_page=100&page=${page}`));
    result.push(...batch);
    if (batch.length < 100) break;
  }
  return result;
}
const runtime: PreviewRuntime = {
  current: async (number) => {
    const pr = prSchema.parse(gh(`pulls/${number}`));
    return {
      open: pr.state === "open",
      sameRepository: pr.head.repo?.full_name === repository,
      sha: pr.head.sha,
      generation: generation(number),
    };
  },
  canPublish: async (sha) => {
    const latest = currentCi(sha);
    return (
      !!latest &&
      isCurrentSuccessfulCi(latest, {
        id: Number(required("PREVIEW_CI_RUN_ID")),
        attempt: Number(required("PREVIEW_CI_ATTEMPT")),
      })
    );
  },
  now: () => new Date().toISOString(),
  comment: async (number, report) => {
    const runId = process.env.GITHUB_RUN_ID;
    const body = previewComment({
      ...report,
      ...(report.state === "ready"
        ? {
            ciRunId: Number(required("PREVIEW_CI_RUN_ID")),
            ciAttempt: Number(required("PREVIEW_CI_ATTEMPT")),
          }
        : {}),
      logUrl: runId
        ? `https://github.com/${repository}/actions/runs/${runId}`
        : undefined,
    });
    const existing = comments(number).find(
      (c) => c.user.login === "github-actions[bot]" && c.body.includes(marker),
    );
    if (existing)
      execFileSync(
        "gh",
        [
          "api",
          `repos/${repository}/issues/comments/${existing.id}`,
          "--method",
          "PATCH",
          "--input",
          "-",
        ],
        { input: JSON.stringify({ body }), stdio: ["pipe", "ignore", "pipe"] },
      );
    else gh(`issues/${number}/comments`, { body });
  },
  deploy: async (number, sha) => {
    assertCurrentCi(
      sha,
      Number(required("PREVIEW_CI_RUN_ID")),
      Number(required("PREVIEW_CI_ATTEMPT")),
    );
    const candidate = resolve(required("PREVIEW_CANDIDATE_DIR"));
    const schemaForCommit = async (commit: string): Promise<string> =>
      previewMigrationHash(
        gh(`git/trees/${shaSchema.parse(commit)}?recursive=1`),
      );
    const schemaHash = await schemaForCommit(sha);
    // 旧形式・symlink・実SQLの不一致を、リソース作成・秘密の設定より前に拒否する。
    assertPreviewArtifact(candidate, sha, schemaHash);
    const reopen = generationState(number);
    const expectedGeneration = reopen.generation;
    const stillCurrent = async (): Promise<boolean> => {
      assertCurrentCi(
        sha,
        Number(required("PREVIEW_CI_RUN_ID")),
        Number(required("PREVIEW_CI_ATTEMPT")),
      );
      const current = await runtime.current(number);
      return (
        current.open &&
        current.sameRepository &&
        current.sha === sha &&
        current.generation === expectedGeneration
      );
    };
    const database = await resources().prepare(number, {
      hash: schemaHash,
      generation: expectedGeneration,
      generationStartedAt: reopen.createdAt,
      legacyHash: schemaForCommit,
      stillCurrent,
    });
    const input = { number, databaseId: database.uuid, sha };
    const config = previewAppConfig(input);
    assertPreviewConfig(config, "app");
    // 信頼済みdevelopの構成だけを使い、PRのbuild.command/接続先を取り込まない。
    const file = resolve(candidate, "wrangler.preview.generated.jsonc");
    const migrationFile = resolve(
      candidate,
      "wrangler.preview-migrations.generated.jsonc",
    );
    writeFileSync(file, JSON.stringify(config));
    try {
      writeFileSync(
        migrationFile,
        JSON.stringify(previewMigrationConfig(input)),
      );
      if (!(await stillCurrent()))
        throw new Error(
          "PRの状態または版が変わったためmigrationを中止しました。",
        );
      cli(
        [
          "d1",
          "migrations",
          "apply",
          "DB",
          "--remote",
          "--config",
          migrationFile,
        ],
        database.name,
      );
      assertCurrentCi(
        sha,
        Number(required("PREVIEW_CI_RUN_ID")),
        Number(required("PREVIEW_CI_ATTEMPT")),
      );
      if (!(await stillCurrent()))
        throw new Error("PRが開き直されたため公開を中止しました。");
      const output = withSecrets(
        (secretFile) =>
          cli([
            "preview",
            "--config",
            file,
            "--name",
            `pr-${number}`,
            "--tag",
            sha,
            "--message",
            previewSchemaMessage(schemaHash, expectedGeneration),
            "--ignore-base-config",
            "--secrets-file",
            secretFile,
            "--json",
          ]),
        number,
        database.uuid,
      );
      // Wrangler --jsonにもassetsの進捗が先行する。末尾の応答は全体を検証する。
      const jsonStart = output.search(/^\{\s*"preview"\s*:/m);
      if (jsonStart < 0)
        throw new Error("WranglerのPreview応答を確認できません。");
      const result = z
        .object({
          preview: z.object({ urls: z.array(z.string().url()).min(1) }),
          deployment: z.object({ urls: z.array(z.string().url()) }).optional(),
        })
        .parse(JSON.parse(output.slice(jsonStart)));
      healthPublication = { sha, stillCurrent };
      return {
        url: result.preview.urls[0].replace(/\/$/, ""),
        deploymentUrl: result.deployment?.urls[0]?.replace(/\/$/, ""),
      };
    } finally {
      rmSync(file, { force: true });
      rmSync(migrationFile, { force: true });
    }
  },
  remove: async (number) => {
    await resources().remove(number, async () => {
      const current = await runtime.current(number);
      return current.sameRepository && !current.open;
    });
  },
  probe: async (url, number) => {
    const publication = healthPublication;
    const target = new URL(url).hostname.startsWith("pr-") ? "normal" : "fixed";
    const log = (fields: Record<string, string | number | undefined>): void => {
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          operation: "health",
          target,
          expectedSHA: publication?.sha,
          ...fields,
        }),
      );
    };
    const assertCurrentPublication = async (attempt: number): Promise<void> => {
      try {
        if (publication && (await publication.stillCurrent())) return;
      } catch {
        // PR/CIを再照合できない場合も、古い対象への接続確認を続けない。
      }
      log({ state: "failed", attempt, reason: "source" });
      throw new Error(
        "Previewの公開元を確認できないためhealth確認を中止しました。",
      );
    };
    for (let attempt = 1; attempt <= healthRetryDelays.length + 1; attempt++) {
      await assertCurrentPublication(attempt);
      log({ state: "started", attempt });
      let reason = "transport";
      let httpStatus: number | undefined;
      let cloudflareCode: number | undefined;
      let apiCommit: string | undefined;
      try {
        const response = await fetch(`${url}/api/health`, {
          redirect: "error",
          headers: {
            "User-Agent": "idea-boost-preview-probe/1.0",
            Accept: "application/json",
            "X-Preview-Probe-Token": previewProbeToken(
              required("PREVIEW_PROBE_TOKEN"),
              number,
            ),
            "CF-Access-Client-Id": required("PREVIEW_ACCESS_CLIENT_ID"),
            "CF-Access-Client-Secret": required("PREVIEW_ACCESS_CLIENT_SECRET"),
          },
          signal: AbortSignal.timeout(15000),
        });
        httpStatus = response.status;
        reason = "http";
        if (!response.ok) {
          if (
            response.headers.get("Content-Type")?.split(";")[0] === "text/plain"
          ) {
            const code = /^error code: (\d{4})\s*$/.exec(await response.text());
            if (code) cloudflareCode = Number(code[1]);
          }
          throw new Error("health failed");
        }
        reason = "response";
        const health = z
          .object({
            ok: z.literal(true),
            environment: z.literal("preview"),
            apiCommit: shaSchema,
          })
          .parse(await response.json());
        apiCommit = health.apiCommit;
        if (apiCommit !== publication?.sha) {
          reason = "version";
          throw new Error("PR版AppとAPIの版が一致しません。");
        }
        log({ state: "succeeded", attempt, httpStatus, apiCommit });
        return health;
      } catch {
        // 本文・Location・認証ヘッダー・生エラーは出力しない。
        const retry =
          (reason === "transport" && attempt < 3) ||
          (reason === "http" &&
            httpStatus !== undefined &&
            httpStatus >= 500 &&
            httpStatus < 600 &&
            attempt <= healthRetryDelays.length) ||
          (reason === "version" && attempt <= healthRetryDelays.length);
        if (retry) await assertCurrentPublication(attempt);
        log({
          state: retry ? "retrying" : "failed",
          attempt,
          reason,
          httpStatus,
          cloudflareCode,
          apiCommit,
        });
        if (retry) {
          await sleep(healthRetryDelays[attempt - 1]);
          continue;
        }
        throw new Error("Previewのhealth確認に失敗しました。");
      }
    }
    throw new Error("Previewのhealth確認に失敗しました。");
  },
};
function currentCi(sha: string) {
  const runs = z
    .object({
      workflow_runs: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          status: z.string(),
          conclusion: z.string().nullable(),
          run_attempt: z.number(),
        }),
      ),
    })
    .parse(gh(`actions/runs?head_sha=${sha}&event=pull_request&per_page=100`));
  return runs.workflow_runs.find((r) => r.name === "CI");
}
function assertCurrentCi(sha: string, id: number, attempt: number): void {
  const latest = currentCi(sha);
  if (!latest || !isCurrentSuccessfulCi(latest, { id, attempt }))
    throw new Error(
      "現在のCI成功を確認できません。古いrun/attemptを公開しません。",
    );
}
function planPublication(pr: z.infer<typeof prSchema>, ci: PreviewCiRun): void {
  const expected = {
    sha: pr.head.sha,
    runId: ci.id,
    attempt: ci.run_attempt,
    generation: generation(pr.number),
  };
  const ready = comments(pr.number).some((comment) => {
    if (
      comment.user.login !== "github-actions[bot]" ||
      !comment.body.includes(marker) ||
      !comment.body.includes("状態：疎通確認済み")
    )
      return false;
    const match = /<!-- preview-publication:(\{[^\n]+\}) -->/.exec(
      comment.body,
    );
    if (!match) return false;
    try {
      const source = z
        .object({
          sha: shaSchema,
          runId: z.number(),
          attempt: z.number(),
          generation: z.number(),
        })
        .parse(JSON.parse(match[1]));
      return (
        source.sha === expected.sha &&
        source.runId === expected.runId &&
        source.attempt === expected.attempt &&
        source.generation === expected.generation
      );
    } catch {
      return false;
    }
  });
  if (ready) return;
  const artifacts: Array<{ id: number; name: string; expired: boolean }> = [];
  for (let page = 1; ; page++) {
    const batch = z
      .object({
        artifacts: z.array(
          z.object({
            id: z.number().int().positive(),
            name: z.string(),
            expired: z.boolean(),
          }),
        ),
      })
      .parse(
        gh(`actions/runs/${ci.id}/artifacts?per_page=100&page=${page}`),
      ).artifacts;
    artifacts.push(...batch);
    if (batch.length < 100) break;
  }
  const artifact = selectPreviewArtifact(
    artifacts,
    pr.head.sha,
    ci.run_attempt,
  );
  appendFileSync(
    required("GITHUB_OUTPUT"),
    `publish=true\nnumber=${pr.number}\nsha=${pr.head.sha}\nci_run_id=${ci.id}\nci_attempt=${ci.run_attempt}\nartifact_id=${artifact.id}\n`,
  );
}
async function plan(): Promise<void> {
  const event = JSON.parse(readFileSync(required("GITHUB_EVENT_PATH"), "utf8"));
  if (event.pull_request) {
    const eventPr = prSchema.parse(event.pull_request);
    const pr = prSchema.parse(gh(`pulls/${eventPr.number}`));
    if (pr.head.repo?.full_name !== repository) return;
    if (
      pr.state === "open" &&
      (event.action === "closed" || eventPr.head.sha !== pr.head.sha)
    )
      return;
    const ci = pr.state === "open" ? currentCi(pr.head.sha) : undefined;
    if (
      ci &&
      isCurrentSuccessfulCi(ci, { id: ci.id, attempt: ci.run_attempt })
    ) {
      planPublication(pr, ci);
      return;
    }
    await reconcilePreview(
      {
        number: pr.number,
        sha: pr.head.sha,
        state:
          pr.state === "closed"
            ? "closed"
            : ci?.conclusion
              ? "failed"
              : "pending",
      },
      runtime,
    );
    return;
  }
  const run = z
    .object({
      id: z.number(),
      run_attempt: z.number(),
      head_sha: shaSchema,
      head_branch: z.string(),
      head_repository: z.object({ full_name: z.string() }),
      conclusion: z.string().nullable(),
      pull_requests: z.array(z.object({ number: z.number() })),
    })
    .parse(event.workflow_run);
  if (run.head_repository.full_name !== repository) return;
  if (!run.pull_requests.length) return; // PRを推測してsecret付き操作を実行しない。
  const pr = prSchema.parse(gh(`pulls/${run.pull_requests[0].number}`));
  if (
    pr.head.repo?.full_name !== repository ||
    pr.head.sha !== run.head_sha ||
    pr.state !== "open"
  )
    return;
  const latest = currentCi(pr.head.sha);
  if (!latest || latest.id !== run.id || latest.run_attempt !== run.run_attempt)
    return;
  if (
    !isCurrentSuccessfulCi(latest, { id: run.id, attempt: run.run_attempt })
  ) {
    await reconcilePreview(
      {
        number: pr.number,
        sha: pr.head.sha,
        state: latest.conclusion ? "failed" : "pending",
      },
      runtime,
    );
    return;
  }
  planPublication(pr, latest);
}
async function publish(): Promise<void> {
  const number = z.coerce
    .number()
    .int()
    .positive()
    .parse(required("PREVIEW_PR_NUMBER"));
  const sha = shaSchema.parse(required("PREVIEW_APP_SHA"));
  await reconcilePreview({ number, sha, state: "success" }, runtime);
}
function api(): void {
  const sha = shaSchema.parse(required("PREVIEW_API_COMMIT"));
  const config = previewApiConfig(required("PREVIEW_D1_ID"), sha);
  const file = resolve(root, "workers/wrangler.preview.generated.jsonc");
  writeFileSync(file, JSON.stringify(config));
  try {
    cli(["d1", "migrations", "apply", "DB", "--remote", "--config", file]);
    withSecrets((secretFile) =>
      cli(["deploy", "--config", file, "--secrets-file", secretFile]),
    );
  } finally {
    rmSync(file, { force: true });
  }
}
const command = process.argv[2];
if (command === "plan") await plan();
else if (command === "publish") await publish();
else if (command === "api") api();
else if (command === "failed") {
  const number = z.coerce
    .number()
    .int()
    .positive()
    .parse(required("PREVIEW_PR_NUMBER"));
  const sha = shaSchema.parse(required("PREVIEW_APP_SHA"));
  const current = await runtime.current(number);
  const latestCi = currentCi(sha);
  if (
    current.sameRepository &&
    current.open &&
    current.sha === sha &&
    latestCi &&
    isCurrentSuccessfulCi(latestCi, {
      id: Number(required("PREVIEW_CI_RUN_ID")),
      attempt: Number(required("PREVIEW_CI_ATTEMPT")),
    })
  )
    await runtime.comment(number, {
      state: "failed",
      appCommit: sha,
      updatedAt: runtime.now(),
    });
} else throw new Error("Usage: preview-control.mts plan|publish|api");

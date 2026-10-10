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
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isCurrentSuccessfulCi } from "./preview-ci.mts";
import {
  assertPreviewConfig,
  previewApiConfig,
  previewAppConfig,
} from "./preview-config.mts";
import {
  type PreviewRuntime,
  previewComment,
  reconcilePreview,
} from "./preview-lifecycle.mts";

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
function cli(args: string[]): string {
  const nameIndex = args.indexOf("--name");
  const target =
    nameIndex >= 0
      ? `idea-boost-preview-app/${args[nameIndex + 1]}`
      : args[0] === "d1"
        ? "idea-boost-preview-lobby"
        : "idea-boost-preview-api";
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
function withSecrets<T>(operation: (file: string) => T): T {
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
    writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
    return operation(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const marker = "<!-- idea-boost-workers-preview -->";
const runtime: PreviewRuntime = {
  current: async (number) => {
    const pr = prSchema.parse(gh(`pulls/${number}`));
    return {
      open: pr.state === "open",
      sameRepository: pr.head.repo?.full_name === repository,
      sha: pr.head.sha,
    };
  },
  now: () => new Date().toISOString(),
  comment: async (number, report) => {
    const runId = process.env.GITHUB_RUN_ID;
    const body = previewComment({
      ...report,
      logUrl: runId
        ? `https://github.com/${repository}/actions/runs/${runId}`
        : undefined,
    });
    const comments: Array<{
      id: number;
      body: string;
      user: { login: string };
    }> = [];
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
      comments.push(...batch);
      if (batch.length < 100) break;
    }
    const existing = comments.find(
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
    const config = previewAppConfig();
    assertPreviewConfig(config, "app");
    // 信頼済みdevelopの構成だけを使い、PRのbuild.command/接続先を取り込まない。
    const file = resolve(candidate, "wrangler.preview.generated.jsonc");
    writeFileSync(file, JSON.stringify(config));
    try {
      const output = withSecrets((secretFile) =>
        cli([
          "preview",
          "--config",
          file,
          "--name",
          `pr-${number}`,
          "--tag",
          sha,
          "--ignore-base-config",
          "--secrets-file",
          secretFile,
          "--json",
        ]),
      );
      const result = z
        .object({
          preview: z.object({ urls: z.array(z.string().url()).min(1) }),
          deployment: z.object({ urls: z.array(z.string().url()) }).optional(),
        })
        .parse(JSON.parse(output));
      return {
        url: result.preview.urls[0].replace(/\/$/, ""),
        deploymentUrl: result.deployment?.urls[0]?.replace(/\/$/, ""),
      };
    } finally {
      rmSync(file, { force: true });
    }
  },
  remove: async (number) => {
    cli([
      "preview",
      "delete",
      "--config",
      resolve(root, "wrangler.preview.jsonc"),
      "--name",
      `pr-${number}`,
      "--skip-confirmation",
      "--json",
    ]);
  },
  probe: async (url) => {
    const response = await fetch(`${url}/api/health`, {
      redirect: "error",
      headers: {
        "X-Preview-Probe-Token": required("PREVIEW_PROBE_TOKEN"),
        "CF-Access-Client-Id": required("PREVIEW_ACCESS_CLIENT_ID"),
        "CF-Access-Client-Secret": required("PREVIEW_ACCESS_CLIENT_SECRET"),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("health failed");
    return z
      .object({
        ok: z.literal(true),
        environment: z.literal("preview"),
        apiCommit: shaSchema,
      })
      .parse(await response.json());
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
async function plan(): Promise<void> {
  const event = JSON.parse(readFileSync(required("GITHUB_EVENT_PATH"), "utf8"));
  if (event.pull_request) {
    const pr = prSchema.parse(
      gh(`pulls/${prSchema.parse(event.pull_request).number}`),
    );
    if (pr.head.repo?.full_name !== repository) return;
    await reconcilePreview(
      {
        number: pr.number,
        sha: pr.head.sha,
        state: pr.state === "closed" ? "closed" : "pending",
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
  appendFileSync(
    required("GITHUB_OUTPUT"),
    `publish=true\nnumber=${pr.number}\nsha=${pr.head.sha}\nci_run_id=${run.id}\nci_attempt=${run.run_attempt}\n`,
  );
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

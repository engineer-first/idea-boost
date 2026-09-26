import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  assertRecordedDeployments,
  githubApi,
  type PreparedRelease,
  prepareRelease,
} from "./release-history.mts";

export type DeployRuntime = {
  run: (command: string) => Promise<void>;
  health: () => Promise<void>;
  now: () => string;
  save: (note: unknown) => Promise<string>;
  submit: (file: string) => Promise<void>;
};
const EvidenceUrl = z
  .string()
  .regex(
    /^https:\/\/github\.com\/engineer-first\/idea-boost\/(issues|pull)\/\d+(#[-\w]+)?$/,
  );

/** 本番操作は順序を固定し、成功のreceiptを残してから記録専用workflowへ渡す。 */
export async function deployProduction(
  plan: PreparedRelease,
  evidenceUrl: string,
  runtime: DeployRuntime,
): Promise<string> {
  EvidenceUrl.parse(evidenceUrl);
  for (const command of ["deploy:migrate", "deploy:api", "deploy:app"])
    await runtime.run(command);
  await runtime.health();
  const receipt = {
    ...plan,
    deployment: {
      kind: "manual",
      completedAt: runtime.now(),
      evidenceUrl,
      migration: true,
      api: true,
      app: true,
      health: true,
    },
  };
  let file: string;
  try {
    file = await runtime.save(receipt);
  } catch (error) {
    throw new Error(
      `本番は公開済みです。再デプロイせず、この成功情報を保存してRecord Releaseへ渡してください:\n${JSON.stringify(receipt, null, 2)}`,
      { cause: error },
    );
  }
  try {
    await runtime.submit(file);
  } catch (error) {
    throw new Error(
      `本番は公開済みです。記録だけ再送してください: npm run release:submit -- ${file}`,
      { cause: error },
    );
  }
  return file;
}

async function submit(file: string): Promise<void> {
  const note = JSON.stringify(JSON.parse(readFileSync(file, "utf8")));
  const repository = z
    .object({ default_branch: z.string() })
    .parse(await githubApi("GET", ""));
  execFileSync(
    "gh",
    [
      "workflow",
      "run",
      "release-history.yml",
      "--repo",
      "engineer-first/idea-boost",
      "--ref",
      repository.default_branch,
      "--raw-field",
      `note_json=${note}`,
    ],
    { stdio: "inherit" },
  );
  console.log(
    "記録workflowを起動しました。Record Releaseの成功とRelease URLを確認してください。",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [command, argument, ...extra] = process.argv.slice(2);
    if (extra.length || !argument)
      throw new Error(
        "Usage: deploy-production.mts deploy <確認用PR/Issue URL> | submit <receipt.json>",
      );
    if (command === "submit") await submit(argument);
    else if (command === "deploy") {
      EvidenceUrl.parse(argument);
      const site = new URL(
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://ideaboost.dev",
      );
      if (site.origin !== "https://ideaboost.dev")
        throw new Error("本番health確認先は https://ideaboost.dev です。");
      if (
        execFileSync("git", ["status", "--porcelain"], {
          encoding: "utf8",
        }).trim()
      )
        throw new Error(
          "未コミットの変更があります。同じ公開commitからデプロイするため作業ツリーをクリーンにしてください。",
        );
      const commit = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      await assertRecordedDeployments(githubApi);
      const plan = await prepareRelease(commit, githubApi);
      const runs = z
        .object({ workflow_runs: z.array(z.object({ status: z.string() })) })
        .parse(
          await githubApi(
            "GET",
            "/actions/workflows/deploy.yml/runs?branch=release&per_page=100",
          ),
        );
      if (runs.workflow_runs.some((run) => run.status !== "completed"))
        throw new Error(
          "Deployが実行・待機中です。手動デプロイを重ねないでください。",
        );
      const directory = resolve(".release-history");
      // デプロイ後に保存先を作れない事態を避けるため、先に作成する。
      mkdirSync(directory, { recursive: true });
      const file = await deployProduction(plan, argument, {
        run: async (script) => {
          execFileSync("npm", ["run", script], { stdio: "inherit" });
        },
        health: async () => {
          for (let count = 0; count < 10; count++) {
            try {
              const response = await fetch(new URL("/api/health", site), {
                signal: AbortSignal.timeout(10000),
              });
              const body: unknown = await response.json();
              if (
                response.ok &&
                body &&
                typeof body === "object" &&
                "ok" in body &&
                body.ok === true
              )
                return;
            } catch {
              /* 次の試行で確認する。成功とは扱わない。 */
            }
            await new Promise((resolveWait) => setTimeout(resolveWait, 3000));
          }
          throw new Error("本番health確認に失敗しました。履歴は公開しません。");
        },
        now: () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        save: async (note) => {
          const receipt = resolve(directory, `${Date.now()}.json`);
          writeFileSync(receipt, `${JSON.stringify(note, null, 2)}\n`, {
            flag: "wx",
          });
          console.log(`成功記録: ${receipt}`);
          return receipt;
        },
        submit,
      });
      console.log(`再送時も同じ成功記録を使います: ${file}`);
    } else throw new Error("Unknown command");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

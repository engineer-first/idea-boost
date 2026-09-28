import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { PromotionApi } from "./promote-release.mts";
import {
  BASELINE_COMMIT,
  BASELINE_TIME,
  type GitHubApi,
  githubApi,
  IncompleteDeploymentError,
  inspectDeployment,
  metadataOf,
  nextReleaseTag,
  ReleasePlan,
  releases,
} from "./release-history.mts";

const Commit = z.string().regex(/^[0-9a-f]{40}$/);
const Ref = z.object({ object: z.object({ sha: Commit }) });
const Run = z.object({
  id: z.number().int().positive(),
  run_attempt: z.number().int().positive(),
  status: z.string(),
  updated_at: z.string(),
  head_sha: Commit.optional(),
  conclusion: z.string().nullable().optional(),
  display_title: z.string().optional(),
  html_url: z.string().optional(),
});
type Run = z.infer<typeof Run>;
const Pull = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  merged_at: z.string().nullable(),
  base: z.object({ ref: z.string() }),
});
const File = z.object({
  filename: z.string(),
  status: z.string(),
  patch: z.string().optional(),
});
const SavedPlan = ReleasePlan.extend({
  title: z.string().trim().min(1).max(120),
});
export type SavedPromotion = {
  commit: string;
  plan: z.infer<typeof SavedPlan>;
  promotionRun?: Run;
};
export type ReleaseSnapshot = {
  status:
    | "ready"
    | "current"
    | "running"
    | "retry-record"
    | "deployment-failed";
  previousCommit: string;
  previousTag: string | null;
  candidate: string;
  releaseHead: string;
  tagCandidate: string;
  prs: z.infer<typeof Pull>[];
  files: z.infer<typeof File>[];
  commits: { sha: string; message: string }[];
  run?: Run;
  savedPlan?: SavedPromotion;
  previousPromotion?: SavedPromotion;
};
async function workflowRuns(workflow: string, api: GitHubApi): Promise<Run[]> {
  const runs: Run[] = [];
  for (let page = 1; ; page++) {
    const batch = z
      .object({ workflow_runs: z.array(Run) })
      .parse(
        await api(
          "GET",
          `/actions/workflows/${workflow}/runs?branch=${workflow === "deploy.yml" ? "release" : "develop"}&per_page=100&page=${page}`,
        ),
      ).workflow_runs;
    runs.push(...batch.filter((run) => run.updated_at > BASELINE_TIME));
    if (batch.length < 100) return runs;
  }
}
/** runのhead_shaはdispatch入力の対象とは限らない。workflowの対象付きrun-nameだけで関連付ける。 */
async function savedPromotion(
  commit: string,
  promotions: Run[],
  api: GitHubApi,
): Promise<SavedPromotion | undefined> {
  const response = await api(
    "GET",
    `/contents/.github/release-note.json?ref=release-plan-${commit}`,
  );
  if (response === null) return undefined;
  const file = z
    .object({ encoding: z.literal("base64"), content: z.string() })
    .parse(response);
  const plan = SavedPlan.parse(
    JSON.parse(Buffer.from(file.content, "base64").toString("utf8")),
  );
  const latest = promotions
    .filter((run) => run.display_title === `Release candidate: ${commit}`)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const promotionRun =
    latest?.status === "completed" &&
    latest.conclusion &&
    latest.conclusion !== "success"
      ? latest
      : undefined;
  return { commit, plan, ...(promotionRun ? { promotionRun } : {}) };
}
/** 全て読取。会話履歴やローカルファイルを実際の公開状態の根拠にしない。 */
export async function inspectRelease(
  api: GitHubApi,
  now = new Date(),
): Promise<ReleaseSnapshot> {
  const history = await releases(api);
  if (history.some((item) => item.draft || item.prerelease))
    throw new Error("未公開のprod-版を確認してください。");
  const metadata = history
    .map(metadataOf)
    .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt));
  const candidate = Ref.parse(await api("GET", "/git/ref/heads/develop")).object
    .sha;
  const releaseHead = Ref.parse(await api("GET", "/git/ref/heads/release"))
    .object.sha;
  const snapshot: ReleaseSnapshot = {
    status: "ready",
    previousCommit: metadata[0]?.commit ?? BASELINE_COMMIT,
    previousTag: metadata[0]?.tag ?? null,
    candidate,
    releaseHead,
    tagCandidate: nextReleaseTag(
      now.toISOString(),
      history.map((item) => item.tag_name),
    ),
    prs: [],
    files: [],
    commits: [],
  };
  const deployments = await workflowRuns("deploy.yml", api);
  const promotions = await workflowRuns("promote-release.yml", api);
  const records = await workflowRuns("release-history.yml", api);
  const running = [...deployments, ...promotions, ...records].find(
    (run) => run.status !== "completed",
  );
  if (running) return { ...snapshot, status: "running", run: running };
  const unrecorded: Run[] = [];
  let failed: Run | undefined;
  for (const run of deployments) {
    try {
      const evidence = await inspectDeployment(run.id, run.run_attempt, api);
      if (evidence.deployedAt <= BASELINE_TIME) continue;
      if (
        !metadata.some(
          (item) =>
            (item.deploymentId ?? item.tag) === evidence.tag &&
            item.commit === evidence.commit &&
            item.deployedAt === evidence.deployedAt,
        )
      )
        unrecorded.push(run);
    } catch (error) {
      if (!(error instanceof IncompleteDeploymentError)) throw error;
      if (
        !failed &&
        run.updated_at > (metadata[0]?.deployedAt ?? BASELINE_TIME)
      )
        failed = run;
    }
  }
  if (unrecorded.length)
    return {
      ...snapshot,
      status: "retry-record",
      run: unrecorded.sort((a, b) =>
        a.updated_at.localeCompare(b.updated_at),
      )[0],
    };
  if (failed) return { ...snapshot, status: "deployment-failed", run: failed };
  if (candidate === snapshot.previousCommit)
    return { ...snapshot, status: "current" };
  snapshot.savedPlan = await savedPromotion(candidate, promotions, api);
  if (releaseHead !== candidate && releaseHead !== snapshot.previousCommit)
    snapshot.previousPromotion = await savedPromotion(
      releaseHead,
      promotions,
      api,
    );
  const comparison = z
    .object({
      status: z.literal("ahead"),
      total_commits: z.number(),
      commits: z.array(
        z.object({ sha: Commit, commit: z.object({ message: z.string() }) }),
      ),
      files: z.array(File),
    })
    .parse(
      await api(
        "GET",
        `/compare/${snapshot.previousCommit}...${candidate}?per_page=100`,
      ),
    );
  // Compareのファイル一覧は300件まで。欠けた差分を完全なものとして要約しない。
  if (comparison.files.length >= 300)
    throw new Error(
      "差分が300ファイル以上です。詳細運用で公開範囲を確認してください。",
    );
  const commits = [...comparison.commits];
  for (let page = 2; commits.length < comparison.total_commits; page++) {
    const batch = z
      .object({
        commits: z.array(
          z.object({ sha: Commit, commit: z.object({ message: z.string() }) }),
        ),
      })
      .parse(
        await api(
          "GET",
          `/compare/${snapshot.previousCommit}...${candidate}?per_page=100&page=${page}`,
        ),
      ).commits;
    if (!batch.length) throw new Error("差分commitの取得が不完全です。");
    commits.push(...batch);
  }
  const prs = new Map<number, z.infer<typeof Pull>>();
  for (const commit of commits) {
    for (let page = 1; ; page++) {
      const batch = z
        .array(Pull)
        .parse(
          await api(
            "GET",
            `/commits/${commit.sha}/pulls?per_page=100&page=${page}`,
          ),
        );
      for (const pr of batch)
        if (pr.merged_at && pr.base.ref === "develop") prs.set(pr.number, pr);
      if (batch.length < 100) break;
    }
  }
  return {
    ...snapshot,
    prs: [...prs.values()].sort((a, b) => a.number - b.number),
    files: comparison.files,
    commits: commits.map((item) => ({
      sha: item.sha,
      message: item.commit.message,
    })),
  };
}
const Draft = z.object({
  snapshot: z.object({
    status: z.literal("ready"),
    candidate: Commit,
    previousCommit: Commit,
    releaseHead: Commit,
  }),
  plan: ReleasePlan.extend({ title: z.string().trim().min(1).max(120) }),
});
function validateDraft(
  input: unknown,
  current: ReleaseSnapshot,
): z.infer<typeof Draft> {
  const draft = Draft.parse(input);
  if (
    current.status !== "ready" ||
    draft.snapshot.candidate !== current.candidate ||
    draft.snapshot.previousCommit !== current.previousCommit ||
    draft.snapshot.releaseHead !== current.releaseHead ||
    draft.plan.previousCommit !== current.previousCommit ||
    draft.plan.mode !== "release"
  )
    throw new Error(
      "公開候補または本番状態が変わりました。statusから再提示してください。",
    );
  if (
    current.savedPlan &&
    JSON.stringify(draft.plan) !== JSON.stringify(current.savedPlan.plan)
  )
    throw new Error(
      "同じ候補の保存済み説明が異なります。保存内容を再提示してください。",
    );
  const prs = new Set(current.prs.map((pr) => pr.number));
  if (
    draft.plan.changes.some((change) => change.prs.some((pr) => !prs.has(pr)))
  )
    throw new Error("公開差分にないPRは指定できません。");
  return draft;
}
/** 自然言語のeditはSkillが説明だけに反映。対象・比較元は再取得して固定する。 */
export async function executeRelease(
  input: unknown,
  consent: string,
  api: GitHubApi,
): Promise<void> {
  if (consent !== "release")
    throw new Error("内容提示後の公開意思が必要です。");
  const current = await inspectRelease(api);
  const draft = validateDraft(input, current);
  await api("POST", "/actions/workflows/promote-release.yml/dispatches", {
    ref: "develop",
    inputs: {
      expected_sha: current.candidate,
      note_json: JSON.stringify(draft.plan),
    },
  });
}
export async function retryRecord(api: GitHubApi): Promise<void> {
  const current = await inspectRelease(api);
  if (current.status !== "retry-record" || !current.run)
    throw new Error(
      "記録だけの回復対象がありません。statusを確認してください。",
    );
  await api("POST", "/actions/workflows/release-history.yml/dispatches", {
    ref: "develop",
    inputs: {
      run_id: String(current.run.id),
      attempt: String(current.run.run_attempt),
    },
  });
}
/** 共通Actionsキュー内で再検証し、説明を不変のGit参照に保存してから公開する。 */
export async function promoteApproved(
  expectedSha: string,
  input: unknown,
  api: PromotionApi,
): Promise<void> {
  Commit.parse(expectedSha);
  const plan = ReleasePlan.extend({
    title: z.string().trim().min(1).max(120),
  }).parse(input);
  // 実行中のこのPromoteは無視する。他のDeploy/Promoteは共通キューが直列化する。
  const readApi: GitHubApi = async (method, path, data) => {
    if (path.startsWith("/actions/workflows/promote-release.yml/runs?"))
      return { workflow_runs: [] };
    return api(method, path, data);
  };
  const state = await inspectRelease(readApi);
  validateDraft(
    { snapshot: { ...state, candidate: expectedSha }, plan },
    state,
  );
  const compare = z
    .object({ status: z.string(), base_commit: z.object({ sha: Commit }) })
    .parse(await api("GET", `/compare/release...${expectedSha}`));
  if (
    !["ahead", "identical"].includes(compare.status) ||
    compare.base_commit.sha !== state.releaseHead
  )
    throw new Error("releaseをfast-forwardできません。");
  const saved = await api(
    "GET",
    `/contents/.github/release-note.json?ref=release-plan-${expectedSha}`,
  );
  if (saved) {
    const file = z
      .object({ content: z.string(), encoding: z.literal("base64") })
      .parse(saved);
    if (
      JSON.stringify(
        ReleasePlan.parse(
          JSON.parse(Buffer.from(file.content, "base64").toString("utf8")),
        ),
      ) !== JSON.stringify(plan)
    )
      throw new Error(
        "同じ候補の保存済み説明が異なります。保存内容を確認してください。",
      );
  } else {
    const tree = z.object({ sha: Commit }).parse(
      await api("POST", "/git/trees", {
        tree: [
          {
            path: ".github/release-note.json",
            mode: "100644",
            type: "blob",
            content: JSON.stringify(plan),
          },
        ],
      }),
    );
    const commit = z.object({ sha: Commit }).parse(
      await api("POST", "/git/commits", {
        message: `Release plan for ${expectedSha}`,
        tree: tree.sha,
        parents: [expectedSha],
      }),
    );
    await api("POST", "/git/refs", {
      ref: `refs/tags/release-plan-${expectedSha}`,
      sha: commit.sha,
    });
  }
  const fresh = Ref.parse(await api("GET", "/git/ref/heads/develop")).object
    .sha;
  if (fresh !== expectedSha)
    throw new Error("developが更新されました。再提示してください。");
  if (state.releaseHead !== expectedSha)
    await api("PATCH", "/git/refs/heads/release", {
      sha: expectedSha,
      force: false,
    });
  await api("POST", "/actions/workflows/deploy.yml/dispatches", {
    ref: "release",
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [command, file, ...rest] = process.argv.slice(2);
    if (command === "status" && !rest.length) {
      const state = await inspectRelease(githubApi);
      const json = JSON.stringify(state, null, 2);
      if (file) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, `${json}\n`);
      }
      console.log(json);
    } else if (
      command === "release" &&
      file &&
      rest.length === 1 &&
      rest[0] === "--confirm"
    ) {
      await executeRelease(
        JSON.parse(readFileSync(file, "utf8")),
        "release",
        githubApi,
      );
      console.log(
        "Promote Releaseを起動しました。statusで完了まで状態を確認してください。",
      );
    } else if (
      command === "retry-record" &&
      file === "--confirm" &&
      !rest.length
    ) {
      await retryRecord(githubApi);
      console.log("記録だけの回復を起動しました。statusで確認してください。");
    } else
      throw new Error(
        "Usage: release:operator -- status [snapshot.json] | release <draft.json> --confirm | retry-record --confirm",
      );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

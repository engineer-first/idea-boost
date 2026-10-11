// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const paths: string[] = [];
const sha = "b".repeat(40);
afterEach(() => {
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function plan(eventSha: string, ciStatus = "completed") {
  const directory = mkdtempSync(resolve(tmpdir(), "preview-plan-test-"));
  paths.push(directory);
  const event = resolve(directory, "event.json");
  const output = resolve(directory, "output");
  const updates = resolve(directory, "updates.jsonl");
  writeFileSync(output, "");
  writeFileSync(updates, "");
  writeFileSync(
    event,
    JSON.stringify({
      action: "synchronize",
      pull_request: {
        number: 12,
        state: "open",
        head: {
          sha: eventSha,
          repo: { full_name: "engineer-first/idea-boost" },
        },
      },
    }),
  );
  writeFileSync(
    resolve(directory, "gh"),
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = process.argv[3];
if (process.argv.includes('--input')) {
  fs.appendFileSync(${JSON.stringify(updates)}, fs.readFileSync(0, 'utf8') + '\\n');
  console.log('{}');
} else if (path.endsWith('/pulls/12')) console.log(JSON.stringify({number:12,state:'open',head:{sha:'${sha}',repo:{full_name:'engineer-first/idea-boost'}}}));
else if (path.includes('/events?')) console.log('[]');
else if (path.includes('/actions/runs?')) console.log(JSON.stringify({workflow_runs:[{name:'CI',id:100,run_attempt:2,status:'${ciStatus}',conclusion:${ciStatus === "completed" ? "'success'" : "null"}}]}));
else if (path.includes('/comments?')) console.log(JSON.stringify([{id:99,body:'<!-- idea-boost-workers-preview -->\\n状態：疎通確認済み\\nApp commit：${sha}',user:{login:'github-actions[bot]'}}]));
else if (path.includes('/artifacts?')) console.log(JSON.stringify({artifacts:[{id:101,name:'preview-app-${sha}-attempt-1',expired:false}]}));
else throw new Error('Unexpected mock path: '+path);
`,
    { mode: 0o755 },
  );
  execFileSync(
    process.execPath,
    [resolve("scripts/preview-control.mts"), "plan"],
    {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        GITHUB_EVENT_PATH: event,
        GITHUB_OUTPUT: output,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return {
    output: readFileSync(output, "utf8"),
    updates: readFileSync(updates, "utf8"),
  };
}

it("古いheadのsynchronizeが後から届いても成功した最新のコメントを消さない", () => {
  const result = plan("a".repeat(40));
  expect(result.updates).toBe("");
  expect(result.output).toBe("");
});
it("同じheadの遅いsynchronizeでも現在CIが成功済みならpendingに戻さない", () => {
  const result = plan(sha);
  expect(result.updates).toBe("");
  expect(result.output).toContain("publish=true");
});
it("現在のCIが再実行中なら成功コメントを更新中へ戻す", () => {
  expect(plan(sha, "in_progress").updates).toContain("品質確認・更新中");
});
it("failed jobsだけの再実行が成功したら同じrunの成功buildのartifactを取得する", () => {
  const result = plan(sha);
  expect(result.output).toContain("ci_attempt=2");
  expect(result.output).toContain("artifact_id=101");
});

it("artifact IDで取得しても公開runnerが読むcandidate直下へ展開する", () => {
  const workflow = readFileSync(".github/workflows/preview.yml", "utf8");
  const download = workflow
    .split("- uses: actions/download-artifact@v4")[1]
    ?.split("# PRのApp/API")[0];
  // v4はname指定なしではartifact名のsubdirectoryへ展開する。
  expect(download).toContain("artifact-ids:");
  expect(download).toContain("merge-multiple: true");
});

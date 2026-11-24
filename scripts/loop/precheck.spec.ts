// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decidePatrol,
  isStopped,
  lastLog,
  type PatrolState,
} from "./precheck.mts";

const NOW = Date.parse("2026-11-24T12:00:00+09:00");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const ACTOR = "loop-bot";
const SHA = "a".repeat(40);

const state = (over: Partial<PatrolState> = {}): PatrolState => ({
  stopped: false,
  openFindings: 0,
  maxOpenFindings: 5,
  lastSha: SHA,
  changedPathsSince: () => ["features/room/ui/room-shell.tsx"],
  ...over,
});

describe("isStopped: チームの誰でも loop:stop 1つで止められる", () => {
  it("open の Issue か PR のどちらかに loop:stop があれば止める", () => {
    expect(isStopped([{ labels: ["bug"] }])).toBe(false);
    expect(isStopped([{ labels: ["bug"] }, { labels: ["loop:stop"] }])).toBe(
      true,
    );
  });
});

describe("decidePatrol: 前回の巡回から画面か境界が変わり、所見を読む余裕があるとき起こす", () => {
  it("止められていれば起こさない", () => {
    expect(decidePatrol(state({ stopped: true })).run).toBe(false);
  });

  it("読まれていない所見がたまっていれば起こさない", () => {
    const d = decidePatrol(state({ openFindings: 5 }));
    expect(d.run).toBe(false);
    expect(d.reason).toContain("5");
    expect(decidePatrol(state({ openFindings: 4 })).run).toBe(true);
  });

  it("巡回の記録が無ければ起こす", () => {
    expect(decidePatrol(state({ lastSha: undefined })).run).toBe(true);
  });

  it("画面・境界のコードが変わっていれば起こし、文書だけなら起こさない", () => {
    expect(decidePatrol(state()).run).toBe(true);
    expect(
      decidePatrol(
        state({
          changedPathsSince: () => ["docs/prd.md", ".github/workflows/ci.yml"],
        }),
      ).run,
    ).toBe(false);
  });
});

describe("lastLog: 記録 Issue のうち、ループのアカウントが書いた最新の記録だけを読む", () => {
  it("他の人のコメントと sha の無いコメントを飛ばす", () => {
    expect(
      lastLog(
        [
          { author: ACTOR, body: `sha: ${SHA}\n巡回`, createdAt: hoursAgo(5) },
          {
            author: "someone",
            body: `sha: ${"f".repeat(40)}`,
            createdAt: hoursAgo(2),
          },
          { author: ACTOR, body: "メモ", createdAt: hoursAgo(1) },
        ],
        ACTOR,
      ),
    ).toEqual({ sha: SHA, at: hoursAgo(5) });
  });
});

describe("CLI: automation が一時ファイルの symlink 経由で起動しても判定する", () => {
  it("知らないループ名なら使い方を出して exit 2 で終わる（判定せずに exit 0 しない）", () => {
    const dir = mkdtempSync(join(tmpdir(), "ib-precheck-"));
    const link = join(dir, "precheck.mts");
    symlinkSync(resolve("scripts/loop/precheck.mts"), link);
    const r = spawnSync(process.execPath, ["--no-warnings", link, "unknown"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage");
  });
});

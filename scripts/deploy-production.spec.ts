// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { type DeployRuntime, deployProduction } from "./deploy-production.mts";
import type { PreparedRelease } from "./release-history.mts";

const plan: PreparedRelease = {
  commit: "a".repeat(40),
  previousCommit: "b".repeat(40),
  mode: "release",
  changes: [
    {
      kind: "修正",
      text: "投票結果を開き直しても表示を保ちます。",
      prs: [370],
    },
  ],
  notices: [],
};
function runtime() {
  const calls: string[] = [];
  const deps: DeployRuntime = {
    run: vi.fn(async (command) => {
      calls.push(command);
    }),
    health: vi.fn(async () => {
      calls.push("health");
    }),
    now: () => "2026-09-26T03:00:00Z",
    save: vi.fn(async () => {
      calls.push("save");
      return "/receipt.json";
    }),
    submit: vi.fn(async () => {
      calls.push("submit");
    }),
  };
  return { calls, deps };
}

describe("ローカル手動デプロイ", () => {
  it("migration・API・App・healthの後にだけ成功証跡を保存し、自動記録を依頼する", async () => {
    const { calls, deps } = runtime();
    await deployProduction(plan, deps);
    expect(calls).toEqual([
      "deploy:migrate",
      "deploy:api",
      "deploy:app",
      "health",
      "save",
      "submit",
    ]);
    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commit: plan.commit,
        deployment: {
          kind: "manual",
          completedAt: "2026-09-26T03:00:00Z",
          migration: true,
          api: true,
          app: true,
          health: true,
        },
      }),
    );
  });
  it.each([
    "deploy:migrate",
    "deploy:api",
    "deploy:app",
    "health",
  ])("%sの失敗では履歴を公開しない", async (failure) => {
    const { deps } = runtime();
    deps.run = vi.fn(async (command) => {
      if (command === failure) throw new Error(failure);
    });
    if (failure === "health")
      deps.health = vi.fn(async () => {
        throw new Error(failure);
      });
    await expect(deployProduction(plan, deps)).rejects.toThrow(failure);
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it("記録依頼だけ失敗してもreceiptを残し、デプロイを繰り返さない", async () => {
    const { deps } = runtime();
    deps.submit = vi.fn(async () => {
      throw new Error("dispatch failed");
    });
    await expect(deployProduction(plan, deps)).rejects.toThrow("/receipt.json");
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(deps.run).toHaveBeenCalledTimes(3);
  });
});

it("本番成功後にreceipt保存が失敗しても、成功情報と再デプロイ不要を知らせる", async () => {
  const { deps } = runtime();
  deps.save = vi.fn(async () => {
    throw new Error("disk full");
  });
  await expect(deployProduction(plan, deps)).rejects.toThrow("本番は公開済み");
  expect(deps.submit).not.toHaveBeenCalled();
});

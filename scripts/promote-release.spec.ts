// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { type PromotionApi, promoteRelease } from "./promote-release.mts";

const releaseSha = "a".repeat(40);
const developSha = "b".repeat(40);

function server() {
  const state = {
    pr: {
      state: "open",
      draft: false,
      head: {
        ref: "develop",
        sha: developSha,
        repo: { full_name: "engineer-first/idea-boost" },
      },
      base: {
        ref: "release",
        repo: { full_name: "engineer-first/idea-boost" },
      },
    },
    develop: { object: { sha: developSha } },
    release: { object: { sha: releaseSha } },
    comparison: {
      status: "ahead",
      base_commit: { sha: releaseSha },
      head_commit: { sha: developSha },
    },
  };
  const api = vi.fn<PromotionApi>(async (method, path, data) => {
    if (method === "GET" && path === "/pulls/123") return state.pr;
    if (method === "GET" && path === "/git/ref/heads/develop")
      return state.develop;
    if (method === "GET" && path === "/git/ref/heads/release")
      return state.release;
    if (method === "GET" && path === "/compare/release...develop")
      return state.comparison;
    if (method === "PATCH" && path === "/git/refs/heads/release") {
      if (data?.sha !== developSha || data.force !== false)
        throw new Error("unsafe update");
      state.release.object.sha = developSha;
      return state.release;
    }
    if (
      method === "POST" &&
      path === "/actions/workflows/deploy.yml/dispatches" &&
      data?.ref === "release"
    )
      return null;
    throw new Error(`Unexpected API: ${method} ${path}`);
  });
  return { state, api };
}

describe("GitHub画面からの本番公開", () => {
  it("対象PRと先端を検証し、非強制更新後にDeployを起動する", async () => {
    const { api } = server();
    await promoteRelease(123, developSha, api);
    expect(api.mock.calls.map(([method, path]) => `${method} ${path}`)).toEqual(
      [
        "GET /pulls/123",
        "GET /git/ref/heads/develop",
        "GET /git/ref/heads/release",
        "GET /compare/release...develop",
        "PATCH /git/refs/heads/release",
        "POST /actions/workflows/deploy.yml/dispatches",
      ],
    );
  });

  it.each([
    [
      "closed PR",
      (state: ReturnType<typeof server>["state"]) => {
        state.pr.state = "closed";
      },
    ],
    [
      "別ブランチ",
      (state: ReturnType<typeof server>["state"]) => {
        state.pr.head.ref = "feature/other";
      },
    ],
    [
      "Draft PR",
      (state: ReturnType<typeof server>["state"]) => {
        state.pr.draft = true;
      },
    ],
    [
      "対象外PR",
      (state: ReturnType<typeof server>["state"]) => {
        state.pr.base.ref = "develop";
      },
    ],
    [
      "古いPR",
      (state: ReturnType<typeof server>["state"]) => {
        state.pr.head.sha = releaseSha;
      },
    ],
    [
      "分岐したrelease",
      (state: ReturnType<typeof server>["state"]) => {
        state.comparison.status = "diverged";
      },
    ],
    [
      "develop更新後",
      (state: ReturnType<typeof server>["state"]) => {
        state.develop.object.sha = releaseSha;
      },
    ],
    [
      "比較中にrelease更新",
      (state: ReturnType<typeof server>["state"]) => {
        state.comparison.base_commit.sha = developSha;
      },
    ],
  ])("%sではreleaseを進めない", async (_label, change) => {
    const { state, api } = server();
    change(state);
    await expect(promoteRelease(123, developSha, api)).rejects.toThrow();
    expect(api.mock.calls.some(([method]) => method === "PATCH")).toBe(false);
    expect(api.mock.calls.some(([method]) => method === "POST")).toBe(false);
  });

  it("release更新に失敗したらDeployを起動しない", async () => {
    const { api } = server();
    const original = api.getMockImplementation();
    api.mockImplementation(async (method, path, data) => {
      if (method === "PATCH") throw new Error("push rejected");
      if (!original) throw new Error("mock missing");
      return original(method, path, data);
    });
    await expect(promoteRelease(123, developSha, api)).rejects.toThrow();
    expect(api.mock.calls.some(([method]) => method === "PATCH")).toBe(true);
    expect(api.mock.calls.some(([method]) => method === "POST")).toBe(false);
  });
});

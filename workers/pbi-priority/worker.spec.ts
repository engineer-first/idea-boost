import { createScheduledController } from "cloudflare:test";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import worker from "./worker";

const env = {
  ISSUE_PROJECT_APP_CLIENT_ID: "test-app",
  ISSUE_PROJECT_APP_PRIVATE_KEY: "",
};
const keys = await generateKeyPair("RS256", { extractable: true });
beforeAll(async () => {
  env.ISSUE_PROJECT_APP_PRIVATE_KEY = await exportPKCS8(keys.privateKey);
});
afterEach(() => vi.restoreAllMocks());
const snapshot = (priority: number) => ({
  data: {
    organization: {
      projectV2: {
        id: "project",
        field: { id: "priority", dataType: "NUMBER" },
        view: {
          filter: "repo:engineer-first/idea-boost is:issue type:PBI is:open",
          sortByFields: { totalCount: 0 },
          groupByFields: { totalCount: 0 },
        },
        items: {
          nodes: [
            {
              id: "item",
              isArchived: false,
              priority: { number: priority },
              content: {
                __typename: "Issue",
                number: 542,
                state: "OPEN",
                repository: { nameWithOwner: "engineer-first/idea-boost" },
                issueType: { name: "PBI" },
                parent: null,
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  },
});
function authentication() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected GitHub request"))
    .mockResolvedValueOnce(Response.json({ id: 123 }))
    .mockResolvedValueOnce(Response.json({ token: "test-installation-token" }));
}

it("Actionsの起動を待たずCronから採番・再読取検証を完了する", async () => {
  const api = authentication()
    .mockResolvedValueOnce(Response.json(snapshot(8)))
    .mockResolvedValueOnce(Response.json(snapshot(8)))
    .mockResolvedValueOnce(
      Response.json({
        data: {
          updateProjectV2ItemFieldValue: { projectV2Item: { id: "item" } },
        },
      }),
    )
    .mockResolvedValueOnce(Response.json(snapshot(1)))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  await worker.scheduled(
    createScheduledController({ cron: "*/5 * * * *" }),
    env,
  );
  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({ event: "pbi_priority_synced", updated: 1 }),
  );
  expect(api).toHaveBeenCalledTimes(7);
  const init = api.mock.calls[0][1];
  const token = new Headers(init?.headers).get("Authorization")?.slice(7);
  expect(token).toBeTruthy();
  await jwtVerify(token ?? "", keys.publicKey, { issuer: "test-app" });
  expect(JSON.parse(String(api.mock.calls[1][1]?.body))).toEqual({
    repositories: ["idea-boost"],
    permissions: { issues: "read", organization_projects: "write" },
  });
  expect(api.mock.calls.at(-1)).toEqual([
    "https://api.github.com/installation/token",
    expect.objectContaining({ method: "DELETE" }),
  ]);
});

it.each([403, 429, 500])(
  "GitHubがHTTP %sならCronを失敗にしトークンを失効する",
  async (status) => {
    const api = authentication()
      .mockResolvedValueOnce(
        Response.json({ message: "unavailable" }, { status }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      worker.scheduled(createScheduledController(), env),
    ).rejects.toThrow(`GitHub HTTP ${status}`);
    expect(api).toHaveBeenCalledTimes(4);
    expect(api.mock.calls.at(-1)?.[1]?.method).toBe("DELETE");
  },
);

it("HTTP 200でもGraphQLエラーがあれば採番せずCronを失敗にする", async () => {
  const api = authentication()
    .mockResolvedValueOnce(
      Response.json({ data: null, errors: [{ message: "forbidden" }] }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(
    worker.scheduled(createScheduledController(), env),
  ).rejects.toThrow("GitHub GraphQL failed");
  expect(api).toHaveBeenCalledTimes(4);
});

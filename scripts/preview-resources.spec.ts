// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createPreviewResources } from "./preview-resources.mts";

const database = {
  uuid: "11111111-1111-4111-8111-111111111111",
  name: "idea-boost-preview-pr-587-lobby",
};
function setup() {
  const fetcher = vi.fn<typeof fetch>();
  const resources = createPreviewResources({
    accountId: "test-account",
    token: "test-token",
    protectedDatabaseIds: ["22222222-2222-4222-8222-222222222222"],
    fetcher,
    audit: vi.fn(),
  });
  return { fetcher, resources };
}
const success = (result: unknown) => Response.json({ success: true, result });
const schema = () => ({
  hash: "a".repeat(64),
  legacyHash: vi.fn(async () => "a".repeat(64)),
  stillCurrent: vi.fn(async () => true),
});
const latest = () =>
  success({
    annotations: {
      "workers/message": `idea-boost-preview-schema:v1:${"a".repeat(64)}`,
    },
  });
const missing = () => Response.json({ success: false }, { status: 404 });
it("同じPRのD1を再利用し、別PRのD1は使わない", async () => {
  const { fetcher, resources } = setup();
  fetcher
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(latest());
  expect(await resources.prepare(587, schema())).toEqual(database);
  fetcher
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(missing())
    .mockResolvedValueOnce(
      success({ ...database, name: "idea-boost-preview-pr-588-lobby" }),
    );
  expect((await resources.prepare(588, schema())).name).toBe(
    "idea-boost-preview-pr-588-lobby",
  );
  expect(JSON.parse(String(fetcher.mock.calls[4][1]?.body))).toEqual({
    name: "idea-boost-preview-pr-588-lobby",
  });
});
it("本番・旧共通D1のIDなら作成・migration・削除に進まない", async () => {
  const { fetcher, resources } = setup();
  fetcher.mockResolvedValue(
    success([{ ...database, uuid: "22222222-2222-4222-8222-222222222222" }]),
  );
  await expect(resources.prepare(587, schema())).rejects.toThrow("D1");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("公開前に閉じても404を成功扱いし、対象PRのD1だけ削除する", async () => {
  const { fetcher, resources } = setup();
  fetcher
    .mockResolvedValueOnce(
      Response.json(
        { success: false, errors: [{ code: 10025 }] },
        { status: 404 },
      ),
    )
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(success(null));
  await resources.remove(587, async () => true);
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(1);
  expect(fetcher.mock.calls[2][0]).toContain(`/d1/database/${database.uuid}`);
});
it("開き直されたPRや、名前の違うD1を削除しない", async () => {
  const { fetcher, resources } = setup();
  fetcher.mockResolvedValueOnce(success(null));
  await expect(resources.remove(587, async () => false)).rejects.toThrow("PR");
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(0);
});
it("API拒否の本文・Token・Account IDをログや例外へ転記しない", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response("test-token test-account secret-value", { status: 403 }),
    );
  const audit = vi.fn();
  const resources = createPreviewResources({
    accountId: "test-account",
    token: "test-token",
    protectedDatabaseIds: [],
    fetcher,
    audit,
  });
  await expect(resources.prepare(587, schema())).rejects.toThrow("Cloudflare");
  expect(JSON.stringify(audit.mock.calls)).not.toMatch(
    /test-token|test-account|secret-value/,
  );
});

it("migrationの内容が変わったら同じPRのPreviewとD1を作り直す", async () => {
  const { fetcher, resources } = setup();
  const recreated = {
    ...database,
    uuid: "33333333-3333-4333-8333-333333333333",
  };
  fetcher
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(
      success({
        annotations: {
          "workers/message": `idea-boost-preview-schema:v1:${"a".repeat(64)}`,
        },
      }),
    )
    .mockResolvedValueOnce(success({}))
    .mockResolvedValueOnce(success(null))
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(success(null))
    .mockResolvedValueOnce(success(recreated));
  const prepared = await resources.prepare(587, {
    hash: "b".repeat(64),
    legacyHash: vi.fn(),
    stillCurrent: async () => true,
  });
  expect(prepared).toEqual(recreated);
  const deletes = fetcher.mock.calls.filter(
    ([, init]) => init?.method === "DELETE",
  );
  expect(deletes.map(([url]) => String(url))).toEqual([
    "https://api.cloudflare.com/client/v4/accounts/test-account/workers/workers/idea-boost-preview-app/previews/pr-587",
    `https://api.cloudflare.com/client/v4/accounts/test-account/d1/database/${database.uuid}`,
  ]);
});

it("同じmigrationなら保存先を使い続け、旧方式の公開にも対応する", async () => {
  const { fetcher, resources } = setup();
  fetcher
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(
      success({ annotations: { "workers/tag": "c".repeat(40) } }),
    );
  const policy = schema();
  expect(await resources.prepare(587, policy)).toEqual(database);
  expect(policy.legacyHash).toHaveBeenCalledWith("c".repeat(40));
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(0);
});
it("PRの版が変わったらmigration変更時でも保存先を削除しない", async () => {
  const { fetcher, resources } = setup();
  fetcher
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(latest());
  await expect(
    resources.prepare(587, {
      ...schema(),
      hash: "b".repeat(64),
      stillCurrent: async () => false,
    }),
  ).rejects.toThrow("PR");
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(0);
});
it("直前の公開版のmigrationを確認できなければ削除せず停止する", async () => {
  const { fetcher, resources } = setup();
  fetcher
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(success({ annotations: {} }));
  await expect(resources.prepare(587, schema())).rejects.toThrow();
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(0);
});
it("Preview削除後にPRの版が変わったらD1は削除しない", async () => {
  const { fetcher, resources } = setup();
  fetcher
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(latest())
    .mockResolvedValueOnce(success({}))
    .mockResolvedValueOnce(success(null));
  const stillCurrent = vi
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  await expect(
    resources.prepare(587, { ...schema(), hash: "b".repeat(64), stillCurrent }),
  ).rejects.toThrow("PR");
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(1);
  expect(
    fetcher.mock.calls.filter(
      ([url, init]) =>
        init?.method === "DELETE" && String(url).includes("/d1/"),
    ),
  ).toHaveLength(0);
});

it("PreviewがないのにD1だけ残っている場合も、途中失敗から作り直せる", async () => {
  const { fetcher, resources } = setup();
  const recreated = {
    ...database,
    uuid: "33333333-3333-4333-8333-333333333333",
  };
  fetcher
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(missing())
    .mockResolvedValueOnce(missing())
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(success(null))
    .mockResolvedValueOnce(success(recreated));
  expect(await resources.prepare(587, schema())).toEqual(recreated);
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(1);
});
it("migrationが同じでもD1が欠けた場合はRoomDOの保存先も作り直す", async () => {
  const { fetcher, resources } = setup();
  fetcher
    .mockResolvedValueOnce(success([]))
    .mockResolvedValueOnce(latest())
    .mockResolvedValueOnce(success({}))
    .mockResolvedValueOnce(success(null))
    .mockResolvedValueOnce(success([]))
    .mockResolvedValueOnce(success(database));
  expect(await resources.prepare(587, schema())).toEqual(database);
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(1);
});
it("初回公開は保存先を新規作成し、削除しない", async () => {
  const { fetcher, resources } = setup();
  fetcher
    .mockResolvedValueOnce(success([]))
    .mockResolvedValueOnce(missing())
    .mockResolvedValueOnce(success(database));
  expect(await resources.prepare(587, schema())).toEqual(database);
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(0);
});

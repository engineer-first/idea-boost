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
it("同じPRのD1を再利用し、別PRのD1は使わない", async () => {
  const { fetcher, resources } = setup();
  fetcher.mockResolvedValueOnce(success([database]));
  expect(await resources.prepare(587)).toEqual(database);
  fetcher
    .mockResolvedValueOnce(success([database]))
    .mockResolvedValueOnce(
      success({ ...database, name: "idea-boost-preview-pr-588-lobby" }),
    );
  expect((await resources.prepare(588)).name).toBe(
    "idea-boost-preview-pr-588-lobby",
  );
  expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({
    name: "idea-boost-preview-pr-588-lobby",
  });
});
it("本番・旧共通D1のIDなら作成・migration・削除に進まない", async () => {
  const { fetcher, resources } = setup();
  fetcher.mockResolvedValue(
    success([{ ...database, uuid: "22222222-2222-4222-8222-222222222222" }]),
  );
  await expect(resources.prepare(587)).rejects.toThrow("D1");
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
  await expect(resources.prepare(587)).rejects.toThrow("Cloudflare");
  expect(JSON.stringify(audit.mock.calls)).not.toMatch(
    /test-token|test-account|secret-value/,
  );
});

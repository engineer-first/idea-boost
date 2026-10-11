// @vitest-environment node
import { expect, it, vi } from "vitest";
import { type PreviewRuntime, reconcilePreview } from "./preview-lifecycle.mts";

const sha = "a".repeat(40);
function runtime(): PreviewRuntime {
  return {
    current: vi.fn(async () => ({ open: true, sameRepository: true, sha })),
    deploy: vi.fn(async () => ({
      url: "https://pr-12.preview.test",
      deploymentUrl: "https://v1-pr-12.preview.test",
    })),
    remove: vi.fn(async () => {}),
    probe: vi.fn(async () => ({ ok: true, apiCommit: "b".repeat(40) })),
    comment: vi.fn(async () => {}),
    now: () => "2026-10-10T00:00:00.000Z",
  };
}
it("古いcommit・forkではデプロイやSecret付きprobeを実行しない", async () => {
  for (const current of [
    { open: true, sameRepository: true, sha: "c".repeat(40) },
    { open: true, sameRepository: false, sha },
  ]) {
    const r = runtime();
    r.current = vi.fn(async () => current);
    await reconcilePreview({ number: 12, sha, state: "success" }, r);
    expect(r.deploy).not.toHaveBeenCalled();
    expect(r.probe).not.toHaveBeenCalled();
  }
});
it("疎通失敗では利用可能にせず、失敗と対象commitを残す", async () => {
  const r = runtime();
  r.probe = vi.fn(async () => {
    throw new Error("bad health");
  });
  await expect(
    reconcilePreview({ number: 12, sha, state: "success" }, r),
  ).rejects.toThrow("Preview");
  expect(r.comment).toHaveBeenLastCalledWith(
    12,
    expect.objectContaining({ state: "failed", appCommit: sha }),
  );
});
it("閉じたPRは対象Appだけ削除し、成功は疎通後にAPIcommitと記録する", async () => {
  const r = runtime();
  await reconcilePreview({ number: 12, sha, state: "success" }, r);
  expect(r.comment).toHaveBeenLastCalledWith(
    12,
    expect.objectContaining({ state: "ready", apiCommit: "b".repeat(40) }),
  );
  r.current = vi.fn(async () => ({ open: false, sameRepository: true, sha }));
  await reconcilePreview({ number: 12, sha, state: "closed" }, r);
  expect(r.remove).toHaveBeenCalledWith(12);
});
it("デプロイ中にPRが閉じられたら削除し、利用可能コメントを出さない", async () => {
  const r = runtime();
  r.current = vi
    .fn()
    .mockResolvedValueOnce({ open: true, sameRepository: true, sha })
    .mockResolvedValue({ open: false, sameRepository: true, sha });
  await reconcilePreview({ number: 12, sha, state: "success" }, r);
  expect(r.remove).toHaveBeenCalledWith(12);
  expect(r.comment).not.toHaveBeenCalledWith(
    12,
    expect.objectContaining({ state: "ready" }),
  );
});
it("固定版URLがない公開は利用可能にしない", async () => {
  const r = runtime();
  r.deploy = vi.fn(async () => ({ url: "https://pr-12.preview.test" }));
  await expect(
    reconcilePreview({ number: 12, sha, state: "success" }, r),
  ).rejects.toThrow("Preview");
  expect(r.comment).toHaveBeenLastCalledWith(
    12,
    expect.objectContaining({ state: "failed" }),
  );
});
it("公開中に閉じたPRは削除後に公開終了を記録する", async () => {
  const r = runtime();
  r.current = vi
    .fn()
    .mockResolvedValueOnce({ open: true, sameRepository: true, sha })
    .mockResolvedValue({ open: false, sameRepository: true, sha });
  await reconcilePreview({ number: 12, sha, state: "success" }, r);
  expect(r.comment).toHaveBeenLastCalledWith(
    12,
    expect.objectContaining({ state: "closed", appCommit: sha }),
  );
});

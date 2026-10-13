// @vitest-environment node
import { expect, it } from "vitest";
import { isCurrentSuccessfulCi, selectPreviewArtifact } from "./preview-ci.mts";

it("同じrun IDの再実行中・旧attemptの成功・新しい別runを成功として使わない", () => {
  const success = {
    id: 12,
    run_attempt: 2,
    status: "completed",
    conclusion: "success",
  };
  expect(isCurrentSuccessfulCi(success, { id: 12, attempt: 2 })).toBe(true);
  for (const latest of [
    { ...success, status: "in_progress", conclusion: null },
    { ...success, conclusion: "failure" },
    { ...success, run_attempt: 3 },
    { ...success, id: 13 },
  ])
    expect(isCurrentSuccessfulCi(latest, { id: 12, attempt: 2 })).toBe(false);
});

it("成功CIの同じrunから直近の残っているbuildを選び、古いhead・未来attempt・期限切れを拒否する", () => {
  const sha = "a".repeat(40);
  const artifact = (id: number, attempt: number, expired = false) => ({
    id,
    name: `preview-app-${sha}-attempt-${attempt}`,
    expired,
  });
  const previous = artifact(101, 1);
  expect(selectPreviewArtifact([previous], sha, 2)).toEqual(previous);
  expect(selectPreviewArtifact([previous, artifact(102, 2)], sha, 2).id).toBe(
    102,
  );
  for (const list of [
    [artifact(102, 3)],
    [artifact(101, 1, true)],
    [{ ...previous, name: `preview-app-${"b".repeat(40)}-attempt-1` }],
    [previous, { ...previous, id: 103 }],
  ])
    expect(() => selectPreviewArtifact(list, sha, 2)).toThrow("artifact");
});

it("PRを開き直したときだけ最新の成功CIを再公開に使う", async () => {
  const { reopenedPreviewCi } = await import("./preview-ci.mts");
  const ci = {
    id: 12,
    run_attempt: 2,
    status: "completed",
    conclusion: "success",
  };
  expect(reopenedPreviewCi("reopened", ci)).toEqual({ id: 12, attempt: 2 });
  expect(reopenedPreviewCi("opened", ci)).toBeNull();
  expect(reopenedPreviewCi("reopened", undefined)).toBeNull();
  expect(
    reopenedPreviewCi("reopened", { ...ci, status: "in_progress" }),
  ).toBeNull();
  expect(
    reopenedPreviewCi("reopened", { ...ci, conclusion: "failure" }),
  ).toBeNull();
});

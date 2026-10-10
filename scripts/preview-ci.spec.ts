// @vitest-environment node
import { expect, it } from "vitest";
import { isCurrentSuccessfulCi } from "./preview-ci.mts";

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

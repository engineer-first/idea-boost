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

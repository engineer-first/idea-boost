export type PreviewCiRun = {
  id: number;
  run_attempt: number;
  status: string;
  conclusion: string | null;
};
export function reopenedPreviewCi(
  action: string,
  latest: PreviewCiRun | undefined,
): { id: number; attempt: number } | null {
  if (action !== "reopened" || !latest) return null;
  const expected = { id: latest.id, attempt: latest.run_attempt };
  return isCurrentSuccessfulCi(latest, expected) ? expected : null;
}
export function isCurrentSuccessfulCi(
  latest: PreviewCiRun,
  expected: { id: number; attempt: number },
): boolean {
  return (
    latest.id === expected.id &&
    latest.run_attempt === expected.attempt &&
    latest.status === "completed" &&
    latest.conclusion === "success"
  );
}

export type PreviewCiRun = {
  id: number;
  run_attempt: number;
  status: string;
  conclusion: string | null;
};
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

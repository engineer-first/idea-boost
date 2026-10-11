export type PreviewCiRun = {
  id: number;
  run_attempt: number;
  status: string;
  conclusion: string | null;
};
export type PreviewCiArtifact = { id: number; name: string; expired: boolean };
// failed jobsのみの再実行ではbuildが再実行されず、以前の成功buildのartifactを使う。
export function selectPreviewArtifact(
  artifacts: readonly PreviewCiArtifact[],
  sha: string,
  ciAttempt: number,
): PreviewCiArtifact {
  const candidates = artifacts
    .flatMap((artifact) => {
      const match = new RegExp(`^preview-app-${sha}-attempt-(\\d+)$`).exec(
        artifact.name,
      );
      const attempt = Number(match?.[1]);
      return !artifact.expired &&
        Number.isSafeInteger(attempt) &&
        attempt > 0 &&
        attempt <= ciAttempt
        ? [{ artifact, attempt }]
        : [];
    })
    .sort((a, b) => b.attempt - a.attempt);
  if (
    !candidates.length ||
    (candidates[1] && candidates[1].attempt === candidates[0].attempt)
  )
    throw new Error(
      "現在の成功CIで使えるPreview artifactを一意に確認できません。CIの全ジョブを再実行してください。",
    );
  return candidates[0].artifact;
}
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

const EVIDENCE_TYPES = ["競合調査", "フィードバック", "成果データ"];
const WORK_PROJECT_ID = "PVT_kwDOEYcVLM4Bb8yF";
const EVIDENCE_PROJECT_ID = "PVT_kwDOEYcVLM4Bn1YA";
function isEvidenceIssue(issue) {
  return !issue?.pull_request && EVIDENCE_TYPES.includes(issue?.type?.name);
}
module.exports = {
  EVIDENCE_TYPES,
  WORK_PROJECT_ID,
  EVIDENCE_PROJECT_ID,
  isEvidenceIssue,
};

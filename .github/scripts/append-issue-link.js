function extractIssueNumber(branchRef) {
  if (typeof branchRef !== "string" || !branchRef) {
    return null;
  }
  if (
    /^codex\//i.test(branchRef) ||
    /\/20\d{2}-\d{2}(?:-\d{2})?(?:-|$)/i.test(branchRef)
  ) {
    return null;
  }
  const match = branchRef.match(/^[^/]+\/#?(\d+)(?:$|[-/].*)$/);
  return match ? match[1] : null;
}

function issueLinkMarker(issueNumber) {
  return `<!-- issue-ref:${issueNumber} -->`;
}

function buildBodyWithIssueLink(currentBody, issueNumber) {
  if (!/^\d+$/.test(String(issueNumber))) {
    return null;
  }

  const body = currentBody ?? "";
  if (/<!--\s*issue-ref\s*:/i.test(body)) {
    return null;
  }
  return `${body}\n\n${issueLinkMarker(issueNumber)}\nCloses #${issueNumber}`;
}

module.exports = {
  extractIssueNumber,
  buildBodyWithIssueLink,
  issueLinkMarker,
};

const { extractIssueNumber } = require("./append-issue-link.js");

const ISSUE_REFERENCE_PATTERN = /<!--\s*issue-ref\s*:\s*(\d+)\s*-->/gi;
const ISSUE_REFERENCE_HINT_PATTERN = /<!--\s*issue-ref\s*:/i;

function parseIssueReference(body) {
  if (typeof body !== "string" || !ISSUE_REFERENCE_HINT_PATTERN.test(body)) {
    return null;
  }

  const markerStarts = [...body.matchAll(/<!--\s*issue-ref\s*:/gi)];
  const matches = [...body.matchAll(ISSUE_REFERENCE_PATTERN)];
  if (markerStarts.length !== 1 || matches.length !== markerStarts.length) {
    return null;
  }

  const issueNumber = Number(matches[0][1]);
  return Number.isSafeInteger(issueNumber) && issueNumber > 0
    ? issueNumber
    : null;
}

function hasRequestedReviewer(pullRequest, event, action) {
  const requestedReviewers = pullRequest.requested_reviewers ?? [];
  const requestedTeams = pullRequest.requested_teams ?? [];
  const requestedUser = event.requested_reviewer?.login;
  const requestedTeam = event.requested_team?.slug;

  if (requestedUser) {
    return requestedReviewers.some(
      (reviewer) => reviewer.login === requestedUser,
    );
  }
  if (requestedTeam) {
    return requestedTeams.some((team) => team.slug === requestedTeam);
  }
  return (
    action === "ready_for_review" &&
    (requestedReviewers.length > 0 || requestedTeams.length > 0)
  );
}

function shouldMoveIssueToReview(input) {
  const {
    action,
    event,
    pullRequest,
    issue,
    projectItem,
    repository,
    directPullRequests,
  } = input;
  if (
    !new Set(["opened", "review_requested", "ready_for_review"]).has(action)
  ) {
    return { allowed: false, reason: "unsupported-event" };
  }
  if (pullRequest.state !== "open" || pullRequest.draft) {
    return { allowed: false, reason: "pull-request-not-reviewable" };
  }

  const referencedIssue = parseIssueReference(pullRequest.body);
  if (referencedIssue === null || referencedIssue !== issue.number) {
    return {
      allowed: false,
      reason: "explicit-issue-reference-missing-or-mismatched",
    };
  }
  if (
    action === "review_requested" &&
    !hasRequestedReviewer(pullRequest, event, action)
  ) {
    return { allowed: false, reason: "no-current-review-request" };
  }

  if (
    issue.state !== "OPEN" ||
    !["Task", "Bug", "Spike", "PBI"].includes(issue.type) ||
    issue.subIssueCount !== 0
  ) {
    return { allowed: false, reason: "issue-type-or-state-not-eligible" };
  }
  if (
    !projectItem?.exists ||
    projectItem.archived ||
    !["壁打ち中", "着手可能", "作業中"].includes(projectItem.status)
  ) {
    return { allowed: false, reason: "project-item-not-in-working-state" };
  }

  return directPullRequestDecision({
    directPullRequests,
    issue,
    repository,
    pullRequest,
  });
}

function directPullRequestDecision({
  directPullRequests,
  issue,
  repository,
  pullRequest,
}) {
  const linkedPullRequests = directPullRequests ?? [];
  const hasAmbiguousIssueReference = linkedPullRequests.some(
    (pullRequestRef) =>
      ISSUE_REFERENCE_HINT_PATTERN.test(pullRequestRef.body ?? "") &&
      parseIssueReference(pullRequestRef.body) === null,
  );
  if (hasAmbiguousIssueReference) {
    return {
      allowed: false,
      reason: "ambiguous-direct-pull-request-reference",
    };
  }

  const directPullRequestKeys = new Set(
    linkedPullRequests
      .filter(
        (pullRequestRef) =>
          parseIssueReference(pullRequestRef.body) === issue.number,
      )
      .map(
        (pullRequestRef) =>
          `${pullRequestRef.repository}#${pullRequestRef.number}`,
      ),
  );
  const currentPullRequestKey = `${repository}#${pullRequest.number}`;
  if (
    directPullRequestKeys.size !== 1 ||
    !directPullRequestKeys.has(currentPullRequestKey)
  ) {
    return {
      allowed: false,
      reason: "issue-has-multiple-or-unknown-direct-pull-requests",
    };
  }

  return { allowed: true, issueNumber: issue.number };
}

function resolvePullRequestIssue(pullRequest, repository) {
  const body = pullRequest.body ?? "";
  if (ISSUE_REFERENCE_HINT_PATTERN.test(body)) return parseIssueReference(body);
  // 同一リポジトリで作られた番号付きブランチだけを信頼する。
  // opened の時点ではリンク追記 workflow がまだ完了していない場合がある。
  if (pullRequest.head?.repo?.full_name !== repository) return null;
  const number = Number(extractIssueNumber(pullRequest.head?.ref));
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function closedIssueStatus(stateReason) {
  if (stateReason === "COMPLETED") return "完了";
  if (["NOT_PLANNED", "DUPLICATE"].includes(stateReason)) return "見送り";
  return null;
}

function decideStatusTransition(input) {
  if (
    ["review_requested", "ready_for_review"].includes(input.action) ||
    (input.action === "opened" && input.pullRequest && !input.pullRequest.draft)
  ) {
    const decision = shouldMoveIssueToReview(input);
    return decision.allowed
      ? { ...decision, from: input.projectItem.status, to: "レビュー中" }
      : decision;
  }
  const { issue, projectItem, event, pullRequest, action } = input;
  if (
    ["closed", "reopened"].includes(action) &&
    event.issue &&
    !event.issue.pull_request
  ) {
    const target =
      action === "reopened"
        ? issue.state === "OPEN"
          ? "着手可能"
          : null
        : issue.state === "CLOSED"
          ? closedIssueStatus(issue.stateReason)
          : null;
    if (
      !target ||
      !projectItem.exists ||
      projectItem.archived ||
      projectItem.status === target
    ) {
      return {
        allowed: false,
        reason: "issue-or-project-not-eligible-for-lifecycle",
      };
    }
    return {
      allowed: true,
      issueNumber: issue.number,
      from: projectItem.status,
      to: target,
    };
  }
  if (action === "assigned") {
    if (
      issue.state !== "OPEN" ||
      !projectItem.exists ||
      projectItem.archived ||
      projectItem.status !== "未整理" ||
      !event.assignee?.login ||
      !issue.assignees.includes(event.assignee.login)
    ) {
      return {
        allowed: false,
        reason: "issue-not-untriaged-or-assignment-removed",
      };
    }
    return {
      allowed: true,
      issueNumber: issue.number,
      from: "未整理",
      to: "壁打ち中",
    };
  }
  if (action === "closed") {
    if (!pullRequest?.merged) {
      return { allowed: false, reason: "pull-request-not-merged" };
    }
    if (!input.mergedIntoDefaultBranch) {
      return { allowed: false, reason: "pull-request-not-merged-to-default" };
    }
    if (!input.closesReferencedIssue) {
      return { allowed: false, reason: "pull-request-does-not-close-issue" };
    }
    if (
      issue.state !== "CLOSED" ||
      issue.stateReason !== "COMPLETED" ||
      !projectItem.exists ||
      projectItem.archived ||
      !projectItem.status ||
      ["完了", "見送り"].includes(projectItem.status)
    ) {
      return { allowed: false, reason: "project-item-not-completable" };
    }
    return {
      allowed: true,
      issueNumber: issue.number,
      from: projectItem.status,
      to: "完了",
    };
  }
  if (
    issue.state !== "OPEN" ||
    issue.subIssueCount !== 0 ||
    !projectItem.exists ||
    projectItem.archived
  ) {
    return { allowed: false, reason: "issue-or-project-not-eligible" };
  }
  if (action === "opened") {
    if (
      !["Task", "Bug", "Spike"].includes(issue.type) ||
      !["壁打ち中", "着手可能"].includes(projectItem.status)
    ) {
      return { allowed: false, reason: "issue-not-ready-to-start" };
    }
  } else if (action !== "converted_to_draft") {
    return { allowed: false, reason: "unsupported-event" };
  }
  if (pullRequest?.state !== "open" || !pullRequest.draft) {
    return { allowed: false, reason: "pull-request-not-draft" };
  }
  const direct = directPullRequestDecision(input);
  if (!direct.allowed) return direct;
  if (action === "opened")
    return { ...direct, from: projectItem.status, to: "作業中" };
  let record;
  try {
    record = JSON.parse(projectItem.automation ?? "");
  } catch {
    /* 記録なしは手動扱い */
  }
  if (
    !["Task", "Bug", "Spike", "PBI"].includes(issue.type) ||
    projectItem.status !== "レビュー中" ||
    !projectItem.updatedAt ||
    record?.repository !== input.repository ||
    record?.pullNumber !== pullRequest.number ||
    record?.statusUpdatedAt !== projectItem.updatedAt
  ) {
    return {
      allowed: false,
      reason: "review-automation-record-missing-or-stale",
    };
  }
  return { ...direct, from: "レビュー中", to: "作業中" };
}

module.exports = {
  parseIssueReference,
  shouldMoveIssueToReview,
  resolvePullRequestIssue,
  decideStatusTransition,
};

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
  if (!new Set(["review_requested", "ready_for_review"]).has(action)) {
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
  if (!hasRequestedReviewer(pullRequest, event, action)) {
    return { allowed: false, reason: "no-current-review-request" };
  }

  if (
    issue.state !== "OPEN" ||
    !["Task", "Bug", "PBI"].includes(issue.type) ||
    issue.subIssueCount !== 0
  ) {
    return { allowed: false, reason: "issue-type-or-state-not-eligible" };
  }
  if (
    !projectItem?.exists ||
    projectItem.archived ||
    projectItem.status !== "作業中"
  ) {
    return { allowed: false, reason: "project-item-not-in-working-state" };
  }

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

const ISSUE_CONTEXT_QUERY = `
  query ReviewIssueContext($owner: String!, $name: String!, $issueNumber: Int!, $statusFieldName: String!, $after: String) {
    repository(owner: $owner, name: $name) {
      issue(number: $issueNumber) {
        id
        number
        state
        issueType { name }
        subIssuesSummary { total }
        projectItems(first: 100) {
          nodes {
            id
            isArchived
            project { id }
            fieldValueByName(name: $statusFieldName) {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
        timelineItems(first: 100, itemTypes: [CROSS_REFERENCED_EVENT], after: $after) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  body
                  repository { nameWithOwner }
                }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const PROJECT_CONTEXT_QUERY = `
  query ReviewProjectContext($owner: String!, $number: Int!) {
    organization(login: $owner) {
      projectV2(number: $number) {
        id
        fields(first: 100) {
          nodes {
            ... on ProjectV2SingleSelectField {
              id
              name
              options { id name }
            }
          }
        }
      }
    }
  }
`;

const UPDATE_PROJECT_STATUS_MUTATION = `
  mutation MoveIssueToReview($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: { singleSelectOptionId: $optionId }
    }) {
      projectV2Item { id }
    }
  }
`;

function findProjectStatusField(project) {
  const fields = project?.fields?.nodes ?? [];
  return (
    fields.find((field) => field.name === "状態") ??
    fields.find((field) => field.name === "Status") ??
    null
  );
}

async function readIssueContext(
  graphql,
  owner,
  name,
  issueNumber,
  statusFieldName,
) {
  let cursor = null;
  let issue = null;
  const directPullRequests = [];

  do {
    const response = await graphql(ISSUE_CONTEXT_QUERY, {
      owner,
      name,
      issueNumber,
      statusFieldName,
      after: cursor,
    });
    const page = response.repository?.issue;
    if (!page) {
      return { issue: null, projectItems: [], directPullRequests };
    }
    issue ??= page;
    directPullRequests.push(
      ...(page.timelineItems?.nodes ?? [])
        .map((node) => node.source)
        .filter((source) => source?.number && source.repository?.nameWithOwner)
        .map((source) => ({
          number: source.number,
          repository: source.repository.nameWithOwner,
          body: source.body ?? "",
        })),
    );
    const pageInfo = page.timelineItems?.pageInfo;
    cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
    if (!issue.projectItems) {
      issue.projectItems = page.projectItems;
    }
  } while (cursor);

  return {
    issue,
    projectItems: issue.projectItems?.nodes ?? [],
    directPullRequests,
  };
}

async function syncReviewIssueStatus({
  github,
  context,
  core,
  projectNumber = 3,
}) {
  const { owner, repo } = context.repo;
  const event = context.payload;
  const pullNumber = event.pull_request?.number;
  if (!pullNumber) {
    return { updated: false, reason: "pull-request-payload-missing" };
  }

  const { data: pullRequest } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  const referencedIssueNumber = parseIssueReference(pullRequest.body ?? "");
  if (referencedIssueNumber === null) {
    return {
      updated: false,
      reason: "explicit-issue-reference-missing-or-ambiguous",
    };
  }

  const projectResponse = await github.graphql(PROJECT_CONTEXT_QUERY, {
    owner,
    number: projectNumber,
  });
  const project = projectResponse.organization?.projectV2;
  if (!project) {
    throw new Error(
      `Organization Project #${projectNumber} を読み取れません。`,
    );
  }
  const statusField = findProjectStatusField(project);
  const reviewOption = statusField?.options?.find(
    (option) => option.name === "レビュー中",
  );
  if (!statusField || !reviewOption) {
    throw new Error(
      "Project の状態フィールドまたは「レビュー中」選択肢を読み取れません。",
    );
  }

  const issueContext = await readIssueContext(
    github.graphql,
    owner,
    repo,
    referencedIssueNumber,
    statusField.name,
  );
  const issueData = issueContext.issue;
  if (!issueData) {
    return { updated: false, reason: "issue-not-found" };
  }

  const projectItem = issueContext.projectItems.find(
    (item) => item.project?.id === project.id,
  );
  const existingDirectPullRequests = issueContext.directPullRequests;
  const currentMarkerMatches =
    parseIssueReference(pullRequest.body ?? "") === referencedIssueNumber;
  const directPullRequests = currentMarkerMatches
    ? [
        ...existingDirectPullRequests,
        {
          number: pullNumber,
          repository: `${owner}/${repo}`,
          body: pullRequest.body ?? "",
        },
      ]
    : existingDirectPullRequests;

  const decision = shouldMoveIssueToReview({
    action: event.action,
    event,
    pullRequest: {
      number: pullNumber,
      state: pullRequest.state,
      draft: pullRequest.draft,
      body: pullRequest.body ?? "",
      requested_reviewers: pullRequest.requested_reviewers ?? [],
      requested_teams: pullRequest.requested_teams ?? [],
    },
    issue: {
      number: issueData.number,
      state: issueData.state,
      type: issueData.issueType?.name,
      subIssueCount: issueData.subIssuesSummary?.total,
    },
    projectItem: {
      exists: Boolean(projectItem),
      archived: projectItem?.isArchived ?? true,
      status: projectItem?.fieldValueByName?.name ?? null,
    },
    repository: `${owner}/${repo}`,
    directPullRequests,
  });

  if (!decision.allowed) {
    core.info(
      `Issue #${referencedIssueNumber} の状態は変更しません (${decision.reason})。`,
    );
    return { updated: false, reason: decision.reason };
  }

  await github.graphql(UPDATE_PROJECT_STATUS_MUTATION, {
    projectId: project.id,
    itemId: projectItem.id,
    fieldId: statusField.id,
    optionId: reviewOption.id,
  });
  core.info(
    `Issue #${referencedIssueNumber} の状態を「レビュー中」にしました。`,
  );
  return { updated: true, issueNumber: referencedIssueNumber };
}

module.exports = {
  findProjectStatusField,
  parseIssueReference,
  shouldMoveIssueToReview,
  syncReviewIssueStatus,
};

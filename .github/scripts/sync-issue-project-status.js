const { extractIssueNumber } = require("./append-issue-link.js");
const {
  parseIssueReference,
  resolvePullRequestIssue,
  decideStatusTransition,
} = require("./issue-status-policy.js");
const ISSUE_REFERENCE_HINT_PATTERN = /<!--\s*issue-ref\s*:/i;

const ISSUE_CONTEXT_QUERY = `
  query ReviewIssueContext($owner: String!, $name: String!, $issueNumber: Int!, $statusFieldName: String!, $after: String) {
    repository(owner: $owner, name: $name) {
      issue(number: $issueNumber) {
        id
        number
        state
        issueType { name }
        subIssuesSummary { total }
        assignees(first: 100) { nodes { login } }
        projectItems(first: 100) {
          nodes {
            id
            isArchived
            project { id }
            automation: fieldValueByName(name: "自動レビュー元") {
              ... on ProjectV2ItemFieldTextValue { text }
            }
            fieldValueByName(name: $statusFieldName) {
              ... on ProjectV2ItemFieldSingleSelectValue { name updatedAt }
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
                  headRefName
                  headRepository { nameWithOwner }
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
            ... on ProjectV2Field { id name dataType }
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

const PULL_REQUEST_CLOSING_ISSUES_QUERY = `
  query PullRequestClosingIssues($owner: String!, $name: String!, $pullNumber: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $pullNumber) {
        closingIssuesReferences(first: 100) {
          nodes { number repository { nameWithOwner } }
        }
      }
    }
  }
`;

const UPDATE_PROJECT_STATUS_MUTATION = `
  mutation UpdateIssueStatus($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!, $statusFieldName: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
      value: { singleSelectOptionId: $optionId }
    }) {
      projectV2Item {
        id
        fieldValueByName(name: $statusFieldName) {
          ... on ProjectV2ItemFieldSingleSelectValue { name updatedAt }
        }
      }
    }
  }
`;
const RECORD_REVIEW_SOURCE_MUTATION = `
  mutation RecordReviewSource($projectId: ID!, $itemId: ID!, $fieldId: ID!, $text: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { text: $text }
    }) { projectV2Item { id } }
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
          body:
            ISSUE_REFERENCE_HINT_PATTERN.test(source.body ?? "") ||
            source.headRepository?.nameWithOwner !== `${owner}/${name}` ||
            source.repository.nameWithOwner !== `${owner}/${name}` ||
            !extractIssueNumber(source.headRefName)
              ? (source.body ?? "")
              : `${source.body ?? ""}\n<!-- issue-ref:${extractIssueNumber(source.headRefName)} -->`,
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

async function syncIssueProjectStatus({
  github,
  context,
  core,
  projectNumber = 3,
}) {
  const { owner, repo } = context.repo;
  const event = context.payload;
  const repository = `${owner}/${repo}`;
  const isAssignment =
    event.action === "assigned" &&
    Boolean(event.issue) &&
    !event.issue.pull_request;
  const supported =
    isAssignment ||
    (Boolean(event.pull_request) &&
      [
        "opened",
        "review_requested",
        "ready_for_review",
        "converted_to_draft",
        "closed",
      ].includes(event.action));
  if (!supported) return { updated: false, reason: "unsupported-event" };
  const actor = event.sender?.login;
  if (!actor) return { updated: false, reason: "actor-not-authorized" };

  const trustedMergedClose =
    event.action === "closed" &&
    event.pull_request?.merged === true &&
    event.pull_request.base?.ref === event.repository?.default_branch;
  let permission = { permission: "none" };
  if (!trustedMergedClose) {
    ({ data: permission } =
      await github.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username: actor,
      }));
  }
  let pullRequest = null;
  if (!isAssignment) {
    ({ data: pullRequest } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: event.pull_request.number,
    }));
  }
  const issueNumber = isAssignment
    ? event.issue.number
    : resolvePullRequestIssue(pullRequest, repository);
  // Agent が同一リポジトリの実装ブランチから Draft PR を作った場合も着手できる。
  const trustedDraftBranch =
    event.action === "opened" &&
    pullRequest?.draft &&
    pullRequest.head?.repo?.full_name === repository &&
    Number(extractIssueNumber(pullRequest.head?.ref)) === issueNumber;
  if (
    !["write", "maintain", "admin"].includes(permission.permission) &&
    !trustedDraftBranch &&
    !trustedMergedClose
  ) {
    return { updated: false, reason: "actor-not-authorized" };
  }
  if (!issueNumber)
    return {
      updated: false,
      reason: "explicit-issue-reference-missing-or-ambiguous",
    };
  if (
    pullRequest &&
    resolvePullRequestIssue(event.pull_request, repository) !== issueNumber
  ) {
    return { updated: false, reason: "issue-reference-changed-since-event" };
  }
  const response = await github.graphql(PROJECT_CONTEXT_QUERY, {
    owner,
    number: projectNumber,
  });
  const project = response.organization?.projectV2;
  const statusField = findProjectStatusField(project);
  if (!project || !statusField)
    throw new Error(
      `Project #${projectNumber} の状態フィールドを読み取れません。`,
    );
  const recordField = project.fields.nodes.find(
    (field) => field.name === "自動レビュー元" && field.dataType === "TEXT",
  );

  async function loadInput(currentPullRequest) {
    let closesReferencedIssue = false;
    if (event.action === "closed" && currentPullRequest?.merged) {
      const closingResponse = await github.graphql(
        PULL_REQUEST_CLOSING_ISSUES_QUERY,
        { owner, name: repo, pullNumber: currentPullRequest.number },
      );
      closesReferencedIssue = (
        closingResponse.repository?.pullRequest?.closingIssuesReferences
          ?.nodes ?? []
      ).some(
        (closingIssue) =>
          closingIssue.number === issueNumber &&
          closingIssue.repository?.nameWithOwner === repository,
      );
    }
    const data = await readIssueContext(
      github.graphql,
      owner,
      repo,
      issueNumber,
      statusField.name,
    );
    const issue = data.issue;
    const item = data.projectItems.find(
      (value) => value.project?.id === project.id,
    );
    const effectivePr = currentPullRequest
      ? {
          ...currentPullRequest,
          body:
            parseIssueReference(currentPullRequest.body) === issueNumber
              ? currentPullRequest.body
              : `${currentPullRequest.body ?? ""}\n<!-- issue-ref:${issueNumber} -->`,
        }
      : null;
    return {
      item,
      input: {
        action: event.action,
        event,
        closesReferencedIssue,
        mergedIntoDefaultBranch:
          currentPullRequest?.base?.ref === event.repository?.default_branch,
        repository,
        pullRequest: effectivePr,
        issue: {
          number: issueNumber,
          state: issue?.state,
          type: issue?.issueType?.name,
          subIssueCount: issue?.subIssuesSummary?.total,
          assignees: (issue?.assignees?.nodes ?? []).map((user) => user.login),
        },
        projectItem: {
          exists: Boolean(item),
          archived: item?.isArchived ?? true,
          status: item?.fieldValueByName?.name,
          updatedAt: item?.fieldValueByName?.updatedAt,
          automation: item?.automation?.text,
        },
        directPullRequests: [
          ...data.directPullRequests,
          ...(effectivePr
            ? [
                {
                  number: effectivePr.number,
                  repository,
                  body: effectivePr.body,
                },
              ]
            : []),
        ],
      },
    };
  }
  let snapshot = await loadInput(pullRequest);
  let decision = decideStatusTransition(snapshot.input);
  if (!decision.allowed)
    return { updated: false, issueNumber, reason: decision.reason };
  if (decision.to === "レビュー中" && !recordField)
    throw new Error(
      "Project にテキストフィールド「自動レビュー元」が必要です。",
    );
  const option = statusField.options.find(
    (value) => value.name === decision.to,
  );
  if (!option)
    throw new Error(`Project の状態「${decision.to}」がありません。`);

  // キュー待ちや API 読取中の変更を再確認する。人の操作との原子的 CAS は GitHub API にない。
  if (pullRequest) {
    ({ data: pullRequest } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: pullRequest.number,
    }));
    if (resolvePullRequestIssue(pullRequest, repository) !== issueNumber)
      return {
        updated: false,
        issueNumber,
        reason: "issue-reference-changed-before-update",
      };
  }
  const latest = await loadInput(pullRequest);
  if (
    latest.input.projectItem.status !== snapshot.input.projectItem.status ||
    latest.input.projectItem.updatedAt !==
      snapshot.input.projectItem.updatedAt ||
    latest.input.projectItem.automation !==
      snapshot.input.projectItem.automation
  ) {
    return {
      updated: false,
      issueNumber,
      reason: "project-state-changed-before-update",
    };
  }
  snapshot = latest;
  decision = decideStatusTransition(snapshot.input);
  if (!decision.allowed)
    return { updated: false, issueNumber, reason: decision.reason };
  const result = await github.graphql(UPDATE_PROJECT_STATUS_MUTATION, {
    projectId: project.id,
    itemId: snapshot.item.id,
    fieldId: statusField.id,
    optionId: option.id,
    statusFieldName: statusField.name,
  });
  if (decision.to === "レビュー中") {
    const value =
      result.updateProjectV2ItemFieldValue?.projectV2Item?.fieldValueByName;
    if (value?.name !== "レビュー中" || !value.updatedAt)
      throw new Error(
        "状態更新後の時刻を取得できず、Draft 復帰用の記録を保存できませんでした。",
      );
    await github.graphql(RECORD_REVIEW_SOURCE_MUTATION, {
      projectId: project.id,
      itemId: snapshot.item.id,
      fieldId: recordField.id,
      text: JSON.stringify({
        repository,
        pullNumber: pullRequest.number,
        statusUpdatedAt: value.updatedAt,
      }),
    });
  }
  core.info(`Issue #${issueNumber}: ${decision.from} → ${decision.to}`);
  return { updated: true, issueNumber, from: decision.from, to: decision.to };
}

module.exports = { syncIssueProjectStatus };

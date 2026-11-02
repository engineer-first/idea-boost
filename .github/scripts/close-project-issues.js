const ITEM_FIELDS = `
  id
  isArchived
  project { id }
  fieldValueByName(name: "Status") {
    ... on ProjectV2ItemFieldSingleSelectValue { name updatedAt }
  }
  content {
    __typename
    ... on Issue { id number state updatedAt repository { nameWithOwner } }
  }
`;
const CANDIDATES_QUERY = `
  query ProjectIssueCloseCandidates($owner: String!, $number: Int!, $after: String) {
    organization(login: $owner) {
      projectV2(number: $number) {
        id
        items(first: 100, after: $after) {
          nodes { ${ITEM_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;
const RECHECK_QUERY = `
  query ProjectIssueCloseRecheck($id: ID!) {
    node(id: $id) { ... on ProjectV2Item { ${ITEM_FIELDS} } }
  }
`;

function candidateReason(item, repository) {
  if (
    !item ||
    item.isArchived ||
    item.content?.__typename !== "Issue" ||
    item.content.repository?.nameWithOwner !== repository ||
    item.content.state !== "OPEN"
  )
    return null;
  const status = item.fieldValueByName;
  const statusTime = Date.parse(status?.updatedAt);
  const issueTime = Date.parse(item.content.updatedAt);
  // 新しいIssue操作（reopen等）を、古い終端Statusで打ち消さない。
  if (
    !Number.isFinite(statusTime) ||
    !Number.isFinite(issueTime) ||
    issueTime > statusTime
  )
    return null;
  if (status.name === "完了") return "completed";
  if (status.name === "見送り") return "not_planned";
  return null;
}

async function closeProjectIssues({
  projectGithub,
  github,
  owner,
  repo,
  projectNumber = 3,
  dryRun = true,
}) {
  const repository = `${owner}/${repo}`;
  const items = [];
  let after = null;
  let projectId;
  // 一覧の全ページが取得できてから書き込む。
  do {
    const response = await projectGithub.graphql(CANDIDATES_QUERY, {
      owner,
      number: projectNumber,
      after,
    });
    const project = response.organization?.projectV2;
    if (!project)
      throw new Error(`Project #${projectNumber} を取得できません。`);
    projectId = project.id;
    items.push(...project.items.nodes);
    const page = project.items.pageInfo;
    if (page.hasNextPage && (!page.endCursor || page.endCursor === after))
      throw new Error("Projectの次ページを取得できません。");
    after = page.hasNextPage ? page.endCursor : null;
  } while (after);

  const planned = [];
  const skipped = [];
  const seen = new Set();
  for (const item of items) {
    const reason = candidateReason(item, repository);
    if (!reason || seen.has(item.content.id)) continue;
    seen.add(item.content.id);
    const response = await projectGithub.graphql(RECHECK_QUERY, {
      id: item.id,
    });
    const latest = response.node;
    if (
      candidateReason(latest, repository) !== reason ||
      latest?.project.id !== projectId ||
      latest.content.id !== item.content.id ||
      latest.fieldValueByName.updatedAt !== item.fieldValueByName.updatedAt ||
      latest.content.updatedAt !== item.content.updatedAt
    ) {
      skipped.push({
        number: item.content.number,
        reason: "project-or-issue-changed",
      });
      continue;
    }
    const { data: issue } = await github.rest.issues.get({
      owner,
      repo,
      issue_number: item.content.number,
    });
    if (
      issue.state !== "open" ||
      issue.pull_request ||
      issue.updated_at !== latest.content.updatedAt
    ) {
      skipped.push({ number: item.content.number, reason: "issue-changed" });
      continue;
    }
    const change = {
      number: item.content.number,
      status: latest.fieldValueByName.name,
      reason,
    };
    if (!dryRun) {
      await github.rest.issues.update({
        owner,
        repo,
        issue_number: change.number,
        state: "closed",
        state_reason: reason,
      });
    }
    planned.push(change);
  }
  return { dryRun, planned, skipped };
}

module.exports = { closeProjectIssues };

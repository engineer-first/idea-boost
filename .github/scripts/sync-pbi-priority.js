/**
 * @typedef {{ id: string, isArchived: boolean, priority: {number: number} | null,
 * content: { __typename: string, number: number, state: string,
 * repository: {nameWithOwner: string}, issueType: {name: string} | null,
 * parent: {id: string} | null } | null }} ProjectItem
 * @typedef {{itemId: string, number: number, from: number | null, to: number}} PriorityUpdate
 * @typedef {(query: string, variables: Record<string, unknown>) => Promise<unknown>} Graphql
 */
const FILTER = "repo:engineer-first/idea-boost is:issue type:PBI is:open";
const SNAPSHOT_QUERY = `
  query PbiPrioritySnapshot($owner: String!, $projectNumber: Int!, $viewNumber: Int!, $after: String) {
    organization(login: $owner) {
      projectV2(number: $projectNumber) {
        id
        field(name: "優先順位") { ... on ProjectV2Field { id name dataType } }
        view(number: $viewNumber) {
          filter
          sortByFields(first: 1) { totalCount }
          groupByFields(first: 1) { totalCount }
        }
        items(first: 100, after: $after, orderBy: {field: POSITION, direction: ASC}) {
          nodes {
            id isArchived
            priority: fieldValueByName(name: "優先順位") { ... on ProjectV2ItemFieldNumberValue { number } }
            content {
              __typename
              ... on Issue {
                number state repository { nameWithOwner } issueType { name } parent { id }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;
const UPDATE_MUTATION = `
  mutation UpdatePbiPriority($projectId: ID!, $itemId: ID!, $fieldId: ID!, $priority: Float!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: {number: $priority}
    }) { projectV2Item { id } }
  }
`;

/** @param {ProjectItem[]} items @param {string} repository @returns {ProjectItem[]} */
function selectPbis(items, repository) {
  return items.filter(
    (item) =>
      !item.isArchived &&
      item.content?.__typename === "Issue" &&
      item.content.repository.nameWithOwner === repository &&
      item.content.state === "OPEN" &&
      item.content.issueType?.name === "PBI" &&
      item.content.parent === null,
  );
}

/** @param {ProjectItem[]} items @param {string} repository @returns {PriorityUpdate[]} */
function planPriorityUpdates(items, repository) {
  return selectPbis(items, repository).flatMap((item, index) => {
    const from = item.priority?.number ?? null;
    return from === index + 1
      ? []
      : [{ itemId: item.id, number: item.content.number, from, to: index + 1 }];
  });
}

/**
 * @param {{graphql: Graphql, dryRun?: boolean}} options
 * @returns {Promise<{planned: PriorityUpdate[], updated: number, dryRun: boolean}>}
 */
async function syncPbiPriority({ graphql, dryRun = true }) {
  const repository = "engineer-first/idea-boost";
  async function readSnapshot() {
    const items = [];
    let after = null;
    let project;
    const cursors = new Set();
    do {
      const response = await graphql(SNAPSHOT_QUERY, {
        owner: "engineer-first",
        projectNumber: 3,
        viewNumber: 16,
        after,
      });
      project = response.organization?.projectV2;
      if (project?.field?.dataType !== "NUMBER" || !project.field.id)
        throw new Error("Priority number field not found");
      const view = project.view;
      const tokens = view?.filter?.trim().split(/\s+/).sort().join(" ");
      if (
        tokens !== FILTER.split(/\s+/).sort().join(" ") ||
        view.sortByFields.totalCount !== 0 ||
        view.groupByFields.totalCount !== 0
      ) {
        throw new Error(
          "View filter/sort/group changed; refusing to overwrite priorities",
        );
      }
      if (!project.items?.nodes || project.items.nodes.some((item) => !item))
        throw new Error("Incomplete project items");
      items.push(...project.items.nodes);
      const page = project.items.pageInfo;
      if (!page.hasNextPage) break;
      if (!page.endCursor || cursors.has(page.endCursor))
        throw new Error("Invalid project pagination");
      after = page.endCursor;
      cursors.add(after);
    } while (after);
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new Error("Project changed during pagination");
    return { projectId: project.id, fieldId: project.field.id, items };
  }
  const before = await readSnapshot();
  const planned = planPriorityUpdates(before.items, repository);
  if (dryRun || planned.length === 0) return { planned, updated: 0, dryRun };
  const fingerprint = (snapshot) =>
    JSON.stringify({
      projectId: snapshot.projectId,
      fieldId: snapshot.fieldId,
      pbis: selectPbis(snapshot.items, repository).map((item) => [
        item.id,
        item.priority?.number ?? null,
      ]),
    });
  const latest = await readSnapshot();
  if (fingerprint(before) !== fingerprint(latest))
    throw new Error("Project order or priorities changed; retry on next run");
  for (const change of planned) {
    const response = await graphql(UPDATE_MUTATION, {
      projectId: latest.projectId,
      fieldId: latest.fieldId,
      itemId: change.itemId,
      priority: change.to,
    });
    if (
      response.updateProjectV2ItemFieldValue?.projectV2Item?.id !==
      change.itemId
    )
      throw new Error("Priority update was not confirmed");
  }
  const verified = await readSnapshot();
  const expectedIds = selectPbis(latest.items, repository)
    .map((item) => item.id)
    .join(",");
  if (
    selectPbis(verified.items, repository)
      .map((item) => item.id)
      .join(",") !== expectedIds ||
    planPriorityUpdates(verified.items, repository).length
  ) {
    throw new Error(
      "Project changed during updates or priority verification failed; retry on next run",
    );
  }
  return { planned, updated: planned.length, dryRun };
}
module.exports = { planPriorityUpdates, syncPbiPriority };

const {
  EVIDENCE_PROJECT_ID,
  WORK_PROJECT_ID,
  isEvidenceIssue,
} = require("./evidence-issue-policy.js");

async function syncEvidenceIssue({
  github,
  issuesGithub,
  owner,
  repo,
  issueNumber,
  dryRun = true,
}) {
  const params = { owner, repo, issue_number: issueNumber };
  const read = async () => (await issuesGithub.rest.issues.get(params)).data;
  const initial = await read();
  if (!isEvidenceIssue(initial))
    return { updated: false, reason: "not-evidence" };
  const readItems = async () => {
    const items = [];
    let after = null;
    do {
      const result = await github.graphql(
        `query EvidenceItems($id:ID!,$after:String){node(id:$id){...on Issue{projectItems(first:100,after:$after){nodes{id isArchived project{id} review:fieldValueByName(name:"確認状態"){...on ProjectV2ItemFieldSingleSelectValue{name}}} pageInfo{hasNextPage endCursor}}}}}`,
        { id: initial.node_id, after },
      );
      if (!result.node?.projectItems)
        throw new Error("IssueのProject所属を取得できません。");
      const page = result.node.projectItems;
      items.push(...page.nodes);
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after);
    return items;
  };
  const items = await readItems();
  const current = async () => {
    const issue = await read();
    return isEvidenceIssue(issue) && issue.type.name === initial.type.name
      ? issue
      : null;
  };
  let latest = await current();
  if (!latest) return { updated: false, reason: "type-changed" };
  const planned = [];
  if (latest.milestone) {
    planned.push("clear-milestone");
    if (!dryRun)
      await issuesGithub.rest.issues.update({ ...params, milestone: null });
  }
  let item = items.find((i) => i.project.id === EVIDENCE_PROJECT_ID);
  if (!item) {
    planned.push("add-evidence-project");
    if (!dryRun) {
      if (!(await current()))
        return { updated: planned.length > 1, reason: "type-changed" };
      try {
        const added = await github.graphql(
          `mutation AddEvidence($projectId:ID!,$contentId:ID!){addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}){item{id}}}`,
          { projectId: EVIDENCE_PROJECT_ID, contentId: initial.node_id },
        );
        item = added.addProjectV2ItemById.item;
      } catch (error) {
        // 標準の自動追加が先に完了した場合だけ、追加済みの項目を利用する。
        if (
          !String(error.message).includes(
            "Content already exists in this project",
          )
        )
          throw error;
        item = (await readItems()).find(
          (i) => i.project.id === EVIDENCE_PROJECT_ID,
        );
        if (!item) throw error;
      }
    }
  }
  if (item && !item.isArchived && !item.review?.name) {
    planned.push("initialize-review");
    if (!dryRun) {
      const fields = await github.graphql(
        `query EvidenceFields($id:ID!){node(id:$id){...on ProjectV2{fields(first:100){nodes{...on ProjectV2SingleSelectField{id name options{id name}}}}}}}`,
        { id: EVIDENCE_PROJECT_ID },
      );
      const field = fields.node?.fields.nodes.find(
        (f) => f.name === "確認状態",
      );
      const option = field?.options.find((o) => o.name === "未確認");
      if (!option) throw new Error("蓄積Projectの確認状態を取得できません。");
      if (!(await current())) return { updated: true, reason: "type-changed" };
      await github.graphql(
        `mutation InitializeEvidenceReview($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){projectV2Item{id}}}`,
        {
          projectId: EVIDENCE_PROJECT_ID,
          itemId: item.id,
          fieldId: field.id,
          optionId: option.id,
        },
      );
    }
  }
  const work = items.find(
    (i) => i.project.id === WORK_PROJECT_ID && !i.isArchived,
  );
  if (work) {
    planned.push("archive-work-project-item");
    if (!dryRun) {
      latest = await current();
      if (!latest) return { updated: true, reason: "type-changed" };
      await github.graphql(
        `mutation ArchiveWork($projectId:ID!,$itemId:ID!){archiveProjectV2Item(input:{projectId:$projectId,itemId:$itemId}){item{id}}}`,
        { projectId: WORK_PROJECT_ID, itemId: work.id },
      );
    }
  }
  return { updated: !dryRun && planned.length > 0, planned };
}
module.exports = { syncEvidenceIssue };

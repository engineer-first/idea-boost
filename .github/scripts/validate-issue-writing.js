const MARKER = "<!-- issue-writing:v1 -->";

/** 形式の正本は人にも外部ツールにも公開する共通ガイドに置く。 */
function readWritingContract(markdown) {
  const block = markdown.match(
    /<!-- issue-writing-contract:start -->\s*```json\s*([\s\S]*?)```\s*<!-- issue-writing-contract:end -->/,
  );
  if (!block) throw new Error("Issue記述ルールの形式契約がありません");
  const contract = JSON.parse(block[1]);
  if (contract.version !== 1) throw new Error("未対応のIssue記述ルールです");
  return contract;
}

function prose(body) {
  let fence = null;
  return (body || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\r?\n/)
    .filter((line) => {
      const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (match) {
        if (!fence) fence = match[1];
        else if (match[1][0] === fence[0] && match[1].length >= fence.length)
          fence = null;
        return false;
      }
      return !fence;
    })
    .join("\n");
}

function meaningful(text) {
  return (
    text
      .replace(/_No response_|No response|未記入|TODO|TBD/gi, "")
      .replace(/[\s\-*_#[\].。…]/g, "").length > 0
  );
}

/** 意味・粒度の採点ではなく、入口共通の構造検査だけを行う。 */
function checkIssueWriting(issue, contract) {
  const type = issue.type?.name;
  if (!type)
    return [
      "Issue Typeを設定してください（本文やタイトルからは推測しません）。",
    ];
  const rule = Object.hasOwn(contract.types, type)
    ? contract.types[type]
    : null;
  if (!rule) return [];
  const errors = [];
  if (!issue.title?.trim()) errors.push("タイトルを記入してください。");
  const text = prose(issue.body);
  const headings = [...text.matchAll(/^#{2,3} ([^\n]+?)\s*$/gm)];
  for (const section of rule.sections) {
    const matches = headings.filter((match) => match[1] === section);
    if (matches.length !== 1) {
      errors.push(`「${section}」見出しを1つ記入してください。`);
      continue;
    }
    const match = matches[0];
    const next = headings.find((heading) => heading.index > match.index);
    const content = text.slice(
      match.index + match[0].length,
      next?.index ?? text.length,
    );
    if (!meaningful(content))
      errors.push(`「${section}」の内容を記入してください。`);
  }
  return errors;
}

function sameIssue(a, b) {
  return (
    a.title === b.title && a.body === b.body && a.type?.name === b.type?.name
  );
}

/** 本文や状態を変更せず、Bot自身の案内コメントだけを保守する。 */
async function reportIssueWriting({
  github,
  context,
  contract,
  issueNumber = "",
}) {
  const number = Number(issueNumber || context.payload.issue?.number);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error("正しいIssue番号が必要です");
  const params = { ...context.repo, issue_number: number };
  const { data: issue } = await github.rest.issues.get(params);
  if (issue.pull_request) return { skipped: true, reason: "PRは対象外" };
  const errors = checkIssueWriting(issue, contract);
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...params,
    per_page: 100,
  });
  const existing = comments.find(
    (comment) =>
      comment.user?.type === "Bot" &&
      comment.user?.login === "github-actions[bot]" &&
      comment.body?.startsWith(MARKER),
  );
  if (!errors.length && !existing) return { errors };
  const guide = `https://github.com/${context.repo.owner}/${context.repo.repo}/blob/HEAD/${contract.guidePath}`;
  const body = `${MARKER}\n### Issue記述形式の確認\n\n${errors.length ? errors.map((error) => `- ${error}`).join("\n") : "形式上の不足はありません（対象外Typeへの変更も含みます）。"}\n\n[共通ルールと記入例](${guide})\n\n本文や状態は変更していません。How・具体仕様・詳細テストの未決定は起票や着手を妨げません。Whyと提供したい体験を担当者と確認してください。`;
  if (existing?.body === body) return { errors };
  const { data: latest } = await github.rest.issues.get(params);
  if (!sameIssue(issue, latest))
    return { skipped: true, reason: "検査中に変更されたため再検査を待ちます" };
  if (existing)
    await github.rest.issues.updateComment({
      ...context.repo,
      comment_id: existing.id,
      body,
    });
  else await github.rest.issues.createComment({ ...params, body });
  return { errors };
}

module.exports = { readWritingContract, checkIssueWriting, reportIssueWriting };

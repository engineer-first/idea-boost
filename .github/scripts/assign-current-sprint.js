function resolveCurrentSprint(milestones, now) {
  const current = [];
  for (const milestone of milestones) {
    const description = milestone.description ?? "";
    if (!description.includes("idea-boost-sprint:")) continue;
    const matches = [
      ...description.matchAll(
        /<!--\s*idea-boost-sprint:v([23])\s*([\s\S]*?)-->/g,
      ),
    ];
    if (
      matches.length !== 1 ||
      description.split("idea-boost-sprint:").length !== 2
    ) {
      return { milestone: null, reason: "invalid-sprint-period" };
    }
    let period;
    try {
      period = JSON.parse(matches[0][2]);
    } catch {
      return { milestone: null, reason: "invalid-sprint-period" };
    }
    const isDate = (date) => {
      const time = Date.parse(`${date}T00:00:00Z`);
      return (
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        Number.isFinite(time) &&
        new Date(time).toISOString().slice(0, 10) === date
      );
    };
    if (
      period?.schema_version !== Number(matches[0][1]) ||
      period.timezone !== "Asia/Tokyo" ||
      !isDate(period.assignment_start_date)
    ) {
      return { milestone: null, reason: "invalid-sprint-period" };
    }
    const startAt = Date.parse(
      `${period.assignment_start_date}T00:00:00+09:00`,
    );
    let endAt = Infinity;
    if (milestone.due_on != null) {
      const dueAt = Date.parse(milestone.due_on);
      if (
        typeof milestone.due_on !== "string" ||
        !isDate(milestone.due_on.slice(0, 10)) ||
        !Number.isFinite(dueAt)
      )
        return { milestone: null, reason: "invalid-sprint-period" };
      const dueDate = new Date(dueAt + 9 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      endAt = Date.parse(`${dueDate}T00:00:00+09:00`);
      // v2の過去の境界は保ち、v3だけreview/demo日の翌日00:00を終了にする。
      if (period.schema_version === 3) endAt += 24 * 60 * 60 * 1000;
      if (startAt >= endAt)
        return { milestone: null, reason: "invalid-sprint-period" };
    }
    if (now.getTime() >= startAt && now.getTime() < endAt)
      current.push(milestone);
  }
  if (current.length > 1)
    return { milestone: null, reason: "ambiguous-current-sprint" };
  if (!current.length) return { milestone: null, reason: "no-current-sprint" };
  if (current[0].state !== "open")
    return { milestone: null, reason: "current-sprint-closed" };
  return { milestone: current[0], reason: null };
}

function openIssue(issue) {
  return (
    issue &&
    !issue.pull_request &&
    issue.state === "open" &&
    !["競合調査", "フィードバック", "成果データ"].includes(issue.type?.name)
  );
}

async function assignCurrentSprint({
  github,
  owner,
  repo,
  dryRun = true,
  now = () => new Date(),
  log = () => {},
}) {
  const readSprint = async () => {
    const milestones = await github.paginate(
      github.rest.issues.listMilestones,
      {
        owner,
        repo,
        state: "all",
        per_page: 100,
      },
    );
    return { ...resolveCurrentSprint(milestones, now()), milestones };
  };
  const initial = await readSprint();
  const result = {
    milestone: initial.milestone?.number ?? null,
    reason: initial.reason,
    planned: [],
    updated: [],
    skipped: [],
  };
  if (!initial.milestone) return result;
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  const candidates = new Map(
    issues.filter(openIssue).map((issue) => [issue.number, issue]),
  );
  for (const [number] of candidates) {
    const latestSprint = await readSprint();
    if (latestSprint.milestone?.number !== initial.milestone.number) {
      result.reason = latestSprint.reason ?? "current-sprint-changed";
      break;
    }
    const { data: issue } = await github.rest.issues.get({
      owner,
      repo,
      issue_number: number,
    });
    if (
      !openIssue(issue) ||
      issue.milestone?.number === initial.milestone.number
    ) {
      result.skipped.push(number);
      continue;
    }
    // 再読取中の境界越えや重複開始も、取得済みの全期間で再判定する。
    const beforeWrite = resolveCurrentSprint(latestSprint.milestones, now());
    if (beforeWrite.milestone?.number !== initial.milestone.number) {
      result.reason = beforeWrite.reason ?? "current-sprint-changed";
      break;
    }
    const change = {
      number,
      from: issue.milestone?.number ?? null,
      to: initial.milestone.number,
    };
    result.planned.push(change);
    if (dryRun) continue;
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: number,
      milestone: initial.milestone.number,
    });
    result.updated.push(change);
    log(JSON.stringify(change));
  }
  return result;
}

module.exports = { resolveCurrentSprint, assignCurrentSprint };

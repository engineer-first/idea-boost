#!/usr/bin/env bash
# バーンダウン集計: スプリント(= GitHub Milestone)ごとの未完了Issueの見積合計を表示する。
#
# PBI配下の非PBI・子なし作業IssueはEstimate Hoursを正本とする。
# 組織field自体が未作成と確認できた場合だけ既存est:<N>hラベルを読む。
# remaining_hは未完了Issueの全体見積の合計であり、実残時間・消費時間ではない。
# 種類名の列挙は使わない。欠落があれば合計は未確定(null)、既知分はknown_*_h。
#
# 使い方:
#   scripts/burndown.sh              # 未完了タスクが残るスプリント + マイルストーンなしタスク
#   scripts/burndown.sh --all        # 全スプリント(完了済み含む)
#   scripts/burndown.sh "Sprint 4"   # 指定スプリントのみ
#   scripts/burndown.sh --json       # JSON で出力(チャート更新の自動化用)
#
# 必要なもの: gh(認証済み), jq
set -euo pipefail

OWNER="engineer-first"
NAME="idea-boost"

MODE="text"
SCOPE="open"   # open: 未完了タスクが残るスプリントのみ / all: 全スプリント
ONLY_SPRINT=""
for arg in "$@"; do
  case "$arg" in
    --json) MODE="json" ;;
    --all) SCOPE="all" ;;
    -h|--help) grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      if [[ -n "$ONLY_SPRINT" ]]; then
        echo "エラー: スプリント名は1つだけ指定してください(クオートし忘れていませんか?)" >&2
        exit 1
      fi
      ONLY_SPRINT="$arg"; SCOPE="all" ;;
  esac
done

# A cleared/unset value must not revive an old label. Resolve the definition once.
# Authentication/schema/ambiguity failures stop collection instead of falling back.
field_node_id=$(gh api "orgs/$OWNER/issue-fields" | jq -er '
  if type != "array" then error("Issue field list unavailable") else . end
  | [.[] | select(.name == "Estimate Hours")]
  | if length == 0 then ""
    elif length == 1 and .[0].data_type == "number" and .[0].visibility == "all"
      and (.[0].node_id | type == "string" and length > 0)
    then .[0].node_id
    else error("Estimate Hours definition is ambiguous or invalid") end
')

raw=$(gh api graphql -f owner="$OWNER" -f name="$NAME" -f query='
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    milestones(first: 20, orderBy: {field: DUE_DATE, direction: ASC}) {
      pageInfo { hasNextPage }
      nodes {
        title
        dueOn
        issues(first: 100) {
          pageInfo { hasNextPage }
          nodes {
            number title state
            issueType { name }
            parent { ...Ancestor1 }
            subIssues(first: 1) { totalCount }
            issueFieldValues(first: 100) {
              nodes { ... on IssueFieldNumberValue { value field { ... on IssueFieldNumber { id name } } } }
            }
            labels(first: 20) { nodes { name } }
          }
        }
      }
    }
    noMilestone: issues(first: 100, states: OPEN) {
      pageInfo { hasNextPage }
      nodes {
        number title state
        issueType { name }
        parent { ...Ancestor1 }
        subIssues(first: 1) { totalCount }
        issueFieldValues(first: 100) {
          nodes { ... on IssueFieldNumberValue { value field { ... on IssueFieldNumber { id name } } } }
        }
        milestone { title }
        labels(first: 20) { nodes { name } }
      }
    }
  }
}
fragment Ancestor1 on Issue { issueType { name } parent { ...Ancestor2 } }
fragment Ancestor2 on Issue { issueType { name } parent { ...Ancestor3 } }
fragment Ancestor3 on Issue { issueType { name } parent { ...Ancestor4 } }
fragment Ancestor4 on Issue { issueType { name } parent { ...Ancestor5 } }
fragment Ancestor5 on Issue { issueType { name } parent { ...Ancestor6 } }
fragment Ancestor6 on Issue { issueType { name } parent { ...Ancestor7 } }
fragment Ancestor7 on Issue { issueType { name } parent { ...Ancestor8 } }
fragment Ancestor8 on Issue { issueType { name } }
')

if [[ "$(jq -r '.data.repository.milestones.pageInfo.hasNextPage' <<<"$raw")" == "true" ]]; then
  echo "⚠ マイルストーンが20件を超えています。21件目以降のスプリントは集計対象外です" >&2
fi

summary=$(jq --arg field_id "$field_node_id" --arg today "$(date +%F)" '
  def legacy_est: [.labels.nodes[].name | capture("^est:(?<h>[0-9.]+)h$").h | tonumber] | first // null;
  def has_pbi: if . == null then false elif .issueType.name == "PBI" then true else .parent | has_pbi end;
  def is_work: (.issueType.name != "PBI") and (.subIssues.totalCount == 0) and (.parent | has_pbi);
  def est:
    if $field_id == "" then legacy_est
    else [.issueFieldValues.nodes[]? | select(.field.id == $field_id)
      | .value | select(type == "number" and . >= 0)] | first // null end;
  def complete_sum: if any(.[]; . == null) then null else add // 0 end;

  def aggregate($tasks): {
    total_h:     ([$tasks[] | est] | complete_sum),
    done_h:      ([$tasks[] | select(.state == "CLOSED") | est] | complete_sum),
    remaining_h: ([$tasks[] | select(.state == "OPEN") | est] | complete_sum),
    known_total_h: ([$tasks[] | est // 0] | add // 0),
    known_remaining_h: ([$tasks[] | select(.state == "OPEN") | est // 0] | add // 0),
    tasks_total: ($tasks | length),
    tasks_open:  ([$tasks[] | select(.state == "OPEN")] | length),
    open_tasks:  [$tasks[] | select(.state == "OPEN")
                  | {number, est: est, title}] | sort_by(-(.est // 0)),
    unestimated: [$tasks[] | select(est == null)
                  | {number, state, title}]
  };

  .data.repository as $r
  | {
      generated_at: $today,
      sprints: [
        $r.milestones.nodes[]
        | ([.issues.nodes[] | select(is_work)]) as $tasks
        | { title, due_on: (.dueOn // "" | split("T")[0]), truncated: .issues.pageInfo.hasNextPage }
          + aggregate($tasks)
      ],
      no_milestone: (
        ([$r.noMilestone.nodes[] | select(.milestone == null) | select(is_work)]) as $tasks
        | { truncated: $r.noMilestone.pageInfo.hasNextPage } + aggregate($tasks)
      )
    }
' <<<"$raw")

# スプリント名の表記ゆれ("Sprint4"・"4"・"sprint 4")を実際の Milestone 名に解決する。
# 完全一致だけだと typo 時に黙って空出力になり、残り 0h と誤読しかねないため、
# 見つからないときは候補を出して fail する。
if [[ -n "$ONLY_SPRINT" ]]; then
  resolved=$(jq -r --arg q "$ONLY_SPRINT" '
    def norm: ascii_downcase | gsub("\\s+"; "");
    ($q | norm | if test("^[0-9]+$") then "sprint" + . else . end) as $n
    | [.sprints[].title | select((. | norm) == $n)] | first // empty
  ' <<<"$summary")
  if [[ -z "$resolved" ]]; then
    echo "エラー: スプリント \"$ONLY_SPRINT\" が見つかりません。指定できる名前:" >&2
    jq -r '.sprints[] | "  - \(.title)"' <<<"$summary" >&2
    exit 1
  fi
  ONLY_SPRINT="$resolved"
fi

# JSON/テキスト双方で同じスプリント選択条件を使うため、ここで一度だけ絞り込む。
summary=$(jq --arg scope "$SCOPE" --arg only "$ONLY_SPRINT" '
  .sprints |= map(select(
    ($only != "" and .title == $only)
    or ($only == "" and ($scope == "all" or .tasks_open > 0))
  ))
  | if $only != "" then del(.no_milestone) else . end
' <<<"$summary")

if [[ "$MODE" == "json" ]]; then
  echo "$summary"
  exit 0
fi

jq -r --arg only "$ONLY_SPRINT" '
  def fmt_h: if . == null then "未確定" elif . == floor then "\(floor)h" else "\(.)h" end;
  def task_lines: .[] | "    #\(.number)\t\(.est // "?" | if type == "number" then fmt_h else . end)\t\(.title)";

  "📊 バーンダウン集計 (\(.generated_at))\n",
  (.sprints[]
   | "== \(.title) (〜\(.due_on)) ==",
     "  総見積: \(.total_h | fmt_h) / \(.tasks_total) tasks",
     "  完了:   \(.done_h | fmt_h) / \(.tasks_total - .tasks_open) tasks",
     "  未完了の全体見積: \(.remaining_h | fmt_h)（既知分 \(.known_remaining_h | fmt_h)） / \(.tasks_open) tasks",
     (if .tasks_open > 0 then "  未完了タスク:", (.open_tasks | task_lines) else empty end),
     (if (.unestimated | length) > 0 then
        "  ⚠ 見積未設定(時間集計外): \([.unestimated[] | "#\(.number)"] | join(", "))"
      else empty end),
     (if .truncated then "  ⚠ issueが100件を超えています。101件目以降は未集計です" else empty end),
     ""
  ),
  (if $only == "" and (.no_milestone.tasks_open > 0) then
     .no_milestone
     | "== ⚠ マイルストーンなしの未完了タスク(どのスプリントにも入っていない) ==",
       "  未完了の全体見積: \(.remaining_h | fmt_h)（既知分 \(.known_remaining_h | fmt_h)） / \(.tasks_open) tasks",
       (.open_tasks | task_lines),
       (if .truncated then "  ⚠ open issueが100件を超えています。101件目以降は未集計です" else empty end)
   else empty end)
' <<<"$summary"

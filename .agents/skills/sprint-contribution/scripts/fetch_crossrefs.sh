#!/usr/bin/env bash
# 指定した issue 番号群それぞれについて、CrossReferencedEvent（他 issue/PR からの言及）を
# GraphQL のエイリアスクエリで一括取得する。
#
# なぜ closedByPullRequestsReferences ではなくこちらを使うか:
# PBI issue は Task issue 経由で実装されることが多く、PBI 自身が PR に
# 直接 closes されるケースは少ない（closedByPullRequestsReferences は空になりがち）。
# CrossReferencedEvent なら「この issue が別の issue/PR の本文や commit で
# 言及された」イベントを拾えるので、PBI -> Task issue -> PR の2段構造を辿れる。
#
# 使い方:
#   fetch_crossrefs.sh <owner> <repo> <issue_number> [<issue_number> ...]
#
# 出力: { "<issue_number>": [ {"typename": "Issue"|"PullRequest", "number":N, "title":"...", "state":"..."} , ... ], ... }

set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <owner> <repo> <issue_number> [<issue_number> ...]" >&2
  exit 1
fi

OWNER="$1"
REPO="$2"
shift 2

FIELDS=""
for num in "$@"; do
  FIELDS+="i${num}: issue(number: ${num}) { number timelineItems(first: 50, itemTypes: [CROSS_REFERENCED_EVENT]) { nodes { ... on CrossReferencedEvent { source { __typename ... on Issue { number title state } ... on PullRequest { number title state } } } } } }
"
done

RAW=$(gh api graphql -f query="query { repository(owner: \"${OWNER}\", name: \"${REPO}\") { ${FIELDS} } }")

echo "$RAW" | jq '
  .data.repository
  | to_entries
  | map({
      key: (.value.number | tostring),
      value: [
        .value.timelineItems.nodes[].source
        | select(.__typename != null)
        | {typename: .__typename, number, title, state}
      ]
    })
  | from_entries
'

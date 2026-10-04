#!/usr/bin/env bash
# 指定した PR 番号群それぞれについて author・state・diff 統計を取得する。
#
# なぜ lock ファイルを除外した実質 diff も計算するか:
# additions/deletions の生値は package-lock.json 等の自動生成ファイルで
# 大きく歪む（実例: 表面上 4174 行変更の PR が、lock ファイルを除くと実質 240 行だった）。
# 生の行数だけで貢献度を按分すると、依存関係を1個追加しただけの PR が
# 実装量の大きい PR より「貢献度が高い」ことになってしまうため、
# 按分計算には必ず *_excl_lock の値を使うこと。
#
# 使い方:
#   fetch_pr_stats.sh <owner>/<repo> <pr_number> [<pr_number> ...]
#
# 出力: 各 PR につき1オブジェクトの JSON 配列
#   [{number, title, author, state, mergedAt,
#     additions_raw, deletions_raw, additions_excl_lock, deletions_excl_lock}, ...]

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <owner>/<repo> <pr_number> [<pr_number> ...]" >&2
  exit 1
fi

REPO="$1"
shift

RESULTS="[]"
for num in "$@"; do
  DATA=$(gh pr view "$num" --repo "$REPO" --json number,title,author,state,mergedAt,additions,deletions,files)
  ENTRY=$(echo "$DATA" | jq '
    (.files | map(select(.path | test("(^|/)([a-zA-Z0-9_.-]+\\.)?lock(\\.[a-z]+)?$|package-lock\\.json$") | not))) as $realFiles
    | {
        number,
        title,
        author: .author.login,
        state,
        mergedAt,
        additions_raw: .additions,
        deletions_raw: .deletions,
        additions_excl_lock: ($realFiles | map(.additions) | add // 0),
        deletions_excl_lock: ($realFiles | map(.deletions) | add // 0)
      }
  ')
  RESULTS=$(echo "$RESULTS" | jq --argjson entry "$ENTRY" '. + [$entry]')
done

echo "$RESULTS" | jq '.'

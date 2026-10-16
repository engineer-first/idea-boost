#!/usr/bin/env bash
# shell / apply_patch の編集対象を git の差分から集める。
# stage済みも含む作業ツリーを整形するが、indexを更新するgit addは行わない。
set -uo pipefail

PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$PROJECT_DIR" || exit 0

patterns=('*.ts' '*.tsx' '*.mts' '*.cts' '*.js' '*.mjs' '*.cjs' '*.json' '*.css' '*.scss' '*.md')
# NUL区切りで日本語・空白・改行を保持する。macOS標準のBash 3でも動かす。
seen=()
while IFS= read -r -d '' file; do
  [[ -f "$file" && ! -L "$file" ]] || continue
  duplicate=false
  for previous in "${seen[@]+"${seen[@]}"}"; do
    [[ "$previous" == "$file" ]] && duplicate=true && break
  done
  [[ "$duplicate" == true ]] && continue
  seen+=("$file")
  # 構文エラー等があっても残りを整形する。lintの成否は通常の検査で判断する。
  bash "$PROJECT_DIR/scripts/format-file.sh" "$file" || true
done < <(
  git diff --name-only -z --diff-filter=ACMR -- "${patterns[@]}"
  git diff --cached --name-only -z --diff-filter=ACMR -- "${patterns[@]}"
  git ls-files --others --exclude-standard -z -- "${patterns[@]}"
)
exit 0

#!/usr/bin/env bash
set -uo pipefail

PAYLOAD=$(cat)
STOP_HOOK_ACTIVE=$(jq -r '.stop_hook_active // false' <<<"$PAYLOAD")

# Stop フック起因の継続中に再実行すると無限ループになるためスキップする
[[ "$STOP_HOOK_ACTIVE" == "true" ]] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

# 失敗したときに AI へ返す行数の上限。長いログを読み込ませない。
MAX_LINES=80

# 未コミットの変更（削除は除く）と未追跡のファイル。日本語・空白を含む名前もそのまま扱う。
CHANGED=()
while IFS= read -r -d '' file; do
  CHANGED+=("$file")
done < <(
  {
    git -c core.quotepath=off diff --name-only -z --diff-filter=d HEAD -- 2>/dev/null ||
      git -c core.quotepath=off diff --cached --name-only -z --diff-filter=d -- 2>/dev/null
    git -c core.quotepath=off ls-files --others --exclude-standard -z 2>/dev/null
  } | sort -zu
)

TS_FILES=()
WORKERS_FILES=()
RUN_ALL=false
for file in "${CHANGED[@]+"${CHANGED[@]}"}"; do
  case "$file" in
    *.ts|*.tsx|*.mts|*.cts) TS_FILES+=("$file") ;;
  esac
  case "$file" in
    workers/*.ts|contracts/*.ts) WORKERS_FILES+=("$file") ;;
  esac
  # テストの設定・依存・tsconfig の変更は関係するテストを辿れないため全件を回す
  case "$file" in
    vitest*.mts|vitest.setup.ts|workers/test-setup.ts|package.json|package-lock.json|tsconfig*.json|*/tsconfig*.json)
      RUN_ALL=true
      ;;
  esac
done

# 消した TypeScript のファイルを import している所は関係するテストを辿れないため、全件を回す
DELETED_TS=$(git -c core.quotepath=off diff --name-only --diff-filter=D HEAD -- '*.ts' '*.tsx' '*.mts' '*.cts' 2>/dev/null || true)
[[ -n "$DELETED_TS" ]] && RUN_ALL=true

[[ ${#TS_FILES[@]} -eq 0 && -z "$DELETED_TS" ]] && exit 0

TYPECHECK_CMD="${STOP_TYPECHECK_CMD:-npm run typecheck --silent}"
VITEST="npx --no-install vitest"
TEST_CMD="${STOP_TEST_CMD:-$VITEST related --run --reporter=minimal --passWithNoTests}"
TEST_FULL_CMD="${STOP_TEST_FULL_CMD:-$VITEST run --reporter=minimal --passWithNoTests}"
# workers/ と contracts/ の変更は workerd 上（DO・D1・WS）でしか検証できないため
# 関係する worker テストも回す。それ以外の変更では遅い workerd 起動を避ける。
WORKERS_CMD="${STOP_WORKERS_TEST_CMD:-npm run gen:room-do-migrations --silent >/dev/null && $VITEST related --run --reporter=minimal --passWithNoTests --config vitest.workers.config.mts}"

# 出力の先頭 MAX_LINES 行だけを返す。色の制御文字は落とす。
print_short() {
  local text total
  text=$(sed -e $'s/\x1b\\[[0-9;]*m//g' <<<"$1")
  total=$(wc -l <<<"$text" | tr -d ' ')
  head -n "$MAX_LINES" <<<"$text" >&2
  if ((total > MAX_LINES)); then
    echo "…（残り $((total - MAX_LINES)) 行を省略。全文は同じコマンドを手元で実行する）" >&2
  fi
}

# $1: 失敗時の見出し、$2: コマンド、以降: コマンドへ渡すファイル
run_step() {
  local label="$1" cmd="$2" output
  shift 2
  if ! output=$(bash -c "$cmd \"\$@\"" verify-on-stop "$@" 2>&1); then
    if [[ "$label" == "Typecheck" ]] && grep -q 'error TS' <<<"$output"; then
      output=$(grep 'error TS' <<<"$output")
    fi
    print_short "$output"
    echo "$label failed. Fix the failures before finishing." >&2
    exit 2
  fi
}

run_step "Typecheck" "$TYPECHECK_CMD"
if [[ "$RUN_ALL" == "true" ]]; then
  run_step "Tests" "$TEST_FULL_CMD"
else
  run_step "Tests" "$TEST_CMD" "${TS_FILES[@]}"
fi
if [[ ${#WORKERS_FILES[@]} -gt 0 ]]; then
  run_step "Worker tests" "$WORKERS_CMD" "${WORKERS_FILES[@]}"
fi

exit 0

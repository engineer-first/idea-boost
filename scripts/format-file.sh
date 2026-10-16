#!/usr/bin/env bash
# 1ファイルを拡張子に応じて Biome / remark で整形する共有実装。
# Claude Code (.claude/hooks/format-on-edit.sh)・opencode (opencode.json)・
# Codex (.codex/hooks.json 経由の scripts/format-changed-files.sh) の
# 3箇所から共通で呼び出す。整形ルールをここ1箇所に集約し、ツール間のドリフトを防ぐ。
set -uo pipefail

FILE="${1:?usage: format-file.sh <path>}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 0

case "$FILE" in
  /*) ;;
  *) FILE="$PROJECT_DIR/$FILE" ;;
esac

# `..` を含むパスは文字列としては "$PROJECT_DIR"/* にマッチしてしまう
# (例: "$PROJECT_DIR/../../etc/passwd")。dirname を実際に cd して pwd で
# 実パスへ正規化してから境界判定することで、`..` によるプロジェクト外への
# エスケープを防ぐ (存在しないディレクトリなら cd が失敗し静かに exit する)。
FILE_DIR="$(cd "$(dirname "$FILE")" 2>/dev/null && pwd)" || exit 0
FILE="$FILE_DIR/$(basename "$FILE")"

case "$FILE" in
  "$PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

case "$FILE" in
  */node_modules/*|*/.next/*|*/coverage/*|*/public/*|*/package-lock.json|*/AGENTS.md)
    exit 0
    ;;
esac

# 外部コマンドが壊れた入力やプラグイン不具合でハングしても編集フローを
# ブロックしないよう、可能なら timeout でラップする。coreutils の
# timeout/gtimeout が入っていない環境 (素の macOS など) では従来通り
# タイムアウトなしで実行し、整形自体は動き続けるようにする。
run_with_timeout() {
  local seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
  else
    "$@"
  fi
}

case "$FILE" in
  *.ts|*.tsx|*.mts|*.cts|*.js|*.mjs|*.cjs|*.json|*.css|*.scss)
    run_with_timeout 20 npx --no-install biome check --write "$FILE"
    ;;
  *.md)
    # remark-cli の `-o/--output [path]` は値を取れるオプションなので、
    # `--output "$FILE"` の順で書くと $FILE が出力先の値として食われ、
    # 入力は空の stdin になり、ファイルが空に上書きされてしまう
    # (実機で再現・確認済みの不具合)。$FILE を先に positional 引数として渡し、
    # 末尾の --output を値なしの真偽フラグにすることで in-place 整形になる。
    run_with_timeout 20 npx --no-install remark "$FILE" --quiet --frail --output
    ;;
esac

#!/usr/bin/env bash
# Codex はファイル編集を apply_patch（shellツール経由）で行うため、
# Claude Codeの tool_input.file_path のような単一ファイルパスをフックへ
# 直接受け取れない。そのため対象ファイルの特定は git の作業ツリー差分
# （追跡ファイルの変更 + 未追跡の新規ファイル）から行う。
set -uo pipefail

PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$PROJECT_DIR" || exit 0

{
  git diff --name-only --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.mjs' '*.cjs' '*.json' '*.css' '*.scss' '*.md'
  git ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.js' '*.mjs' '*.cjs' '*.json' '*.css' '*.scss' '*.md'
} | sort -u | while IFS= read -r file; do
  # 1ファイルの整形失敗 (構文エラーや、フォーマット中に削除されたなど) で
  # バッチ全体を失敗させない。pipefail 下では while ループ内の最後のコマンドの
  # 終了コードがそのままこのスクリプト全体の終了コードになるため、個々の失敗を
  # 握りつぶして残りのファイルの整形を継続する。
  if [[ -f "$file" ]]; then
    bash "$PROJECT_DIR/scripts/format-file.sh" "$file" || true
  fi
done

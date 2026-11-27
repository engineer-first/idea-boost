#!/usr/bin/env bash
# worktree 専用の .env.local と workers/.dev.vars を作る。scripts/setup-worktree.sh から呼ぶ。
#
# - 両方の SESSION_SECRET は同じ乱数にする（worktree ごとに別の値）。
# - .env.tpl の op:// の参照は、1Password のサービスアカウントで読めるとき（ループの Mac mini）だけ
#   op inject で埋める。トークンか op が無い環境（メンバーの PC・CI）は今までどおり example の値で作る。
# - 項目が無い・読めないときも止めずに example の値（空）のまま作り、理由を標準エラーに出す。
# - 値は表示・ログ・引数に出さない。すでに両方あれば作り直さない（作り直すには両方を消して再実行する）。
set -euo pipefail

cd "$(dirname "$0")/.."

readonly next_env=".env.local"
readonly worker_env="workers/.dev.vars"
readonly template=".env.tpl"
readonly insecure_secret="local-dev-secret-please-change-me-1234"

read_secret() {
  awk '
    /^SESSION_SECRET=/ {
      sub(/^SESSION_SECRET=/, "")
      print
      exit
    }
  ' "$1"
}

if [[ -f "$next_env" && -f "$worker_env" ]]; then
  next_secret="$(read_secret "$next_env")"
  worker_secret="$(read_secret "$worker_env")"

  if [[ -z "$next_secret" || "$next_secret" == "$insecure_secret" ]]; then
    echo "error: $next_env の SESSION_SECRET が未設定または安全でない値です。" >&2
    exit 1
  fi

  if [[ "$next_secret" != "$worker_secret" ]]; then
    echo "error: $next_env と $worker_env の SESSION_SECRET が一致しません。" >&2
    exit 1
  fi

  echo "==> 既存の環境設定を使用します"
  exit 0
fi

if [[ -e "$next_env" || -e "$worker_env" ]]; then
  echo "error: $next_env と $worker_env の片方だけが存在します。" >&2
  echo "両方を削除して再実行するか、同じ SESSION_SECRET を設定してください。" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "error: SESSION_SECRET の生成に openssl が必要です。" >&2
  exit 1
fi

umask 077
values="$(mktemp)"
err_file="$(mktemp)"
trap 'rm -f "$values" "$err_file"' EXIT

# 差し替える値を「名前=値」の行で $values に集める。awk -v に渡すと ps に見えるのでファイルで渡す
printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)" >"$values"

# .env.tpl の参照を 1行ずつ op inject で埋める。1行ずつにするのは、無い項目があっても残りを埋めるため
inject_from_1password() {
  [[ -f "$template" ]] || return 0
  local token="${OP_SERVICE_ACCOUNT_TOKEN:-}"
  if [[ -z "$token" ]] && command -v security >/dev/null 2>&1; then
    token="$(security find-generic-password -s op-service-account-token -w 2>/dev/null)" || token=""
  fi
  if [[ -z "$token" ]] || ! command -v op >/dev/null 2>&1; then
    echo "==> 1Password を使わずに作ります（サービスアカウントのトークンか op が無い）"
    return 0
  fi

  local line name item resolved filled=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^([A-Z][A-Z0-9_]*)=op://[^/]+/([^/]+)/[^/]+$ ]] || continue
    name="${BASH_REMATCH[1]}"
    item="${BASH_REMATCH[2]}"
    if resolved="$(printf '%s\n' "$line" | OP_SERVICE_ACCOUNT_TOKEN="$token" op inject 2>"$err_file")"; then
      if [[ "$resolved" == "$name="?* && "$resolved" != *$'\n'* ]]; then
        printf '%s\n' "$resolved" >>"$values"
        filled=$((filled + 1))
      else
        echo "warning: ${name} は空のままにします。1Password の「${item}」の credential が空か、1行の値ではありません。" >&2
      fi
    elif grep -qE "could not find item|isn't an item|isn't a field|does not have a field" "$err_file"; then
      echo "warning: ${name} は空のままにします。1Password の Automation 保管庫に項目「${item}」（種類は API 認証情報、値はフィールド credential）がありません。" >&2
    else
      echo "warning: ${name} は空のままにします。1Password から読めませんでした: $(tr '\n' ' ' <"$err_file")" >&2
    fi
  done <"$template"
  echo "==> 1Password から ${filled} 件の値を入れました"
}

inject_from_1password

# example の各行のうち、$values にある名前の行だけを差し替えて書く
render() {
  awk '
    FNR == NR {
      i = index($0, "=")
      value[substr($0, 1, i - 1)] = substr($0, i + 1)
      next
    }
    match($0, /^[A-Z][A-Z0-9_]*=/) {
      name = substr($0, 1, RLENGTH - 1)
      if (name in value) {
        print name "=" value[name]
        next
      }
    }
    { print }
  ' "$values" "$1" >"$2"
}

render .env.example "$next_env"
render workers/.dev.vars.example "$worker_env"

echo "==> worktree 専用の環境設定を作成しました"

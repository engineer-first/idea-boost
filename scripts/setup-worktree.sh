#!/usr/bin/env bash

set -euo pipefail

readonly project_dir="$(git rev-parse --show-toplevel)"
readonly next_env=".env.local"
readonly worker_env="workers/.dev.vars"
readonly insecure_secret="local-dev-secret-please-change-me-1234"

cd "$project_dir"

if ! command -v mise >/dev/null 2>&1; then
  echo "error: mise が見つかりません。https://mise.jdx.dev/ からインストールしてください。" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "error: SESSION_SECRET の生成に openssl が必要です。" >&2
  exit 1
fi

read_secret() {
  awk '
    /^SESSION_SECRET=/ {
      sub(/^SESSION_SECRET=/, "")
      print
      exit
    }
  ' "$1"
}

prepare_env_files() {
  if [[ -f "$next_env" && -f "$worker_env" ]]; then
    local next_secret
    local worker_secret

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
    return
  fi

  if [[ -e "$next_env" || -e "$worker_env" ]]; then
    echo "error: $next_env と $worker_env の片方だけが存在します。" >&2
    echo "両方を削除して再実行するか、同じ SESSION_SECRET を設定してください。" >&2
    exit 1
  fi

  local session_secret
  session_secret="$(openssl rand -hex 32)"

  umask 077

  awk -v secret="$session_secret" '
    /^SESSION_SECRET=/ {
      print "SESSION_SECRET=" secret
      next
    }
    { print }
  ' .env.example >"$next_env"

  awk -v secret="$session_secret" '
    /^SESSION_SECRET=/ {
      print "SESSION_SECRET=" secret
      next
    }
    { print }
  ' workers/.dev.vars.example >"$worker_env"

  echo "==> worktree 専用の環境設定を作成しました"
}

echo "==> mise のツールを準備します"
mise install

prepare_env_files

echo "==> npm パッケージをインストールします"
mise exec -- npm ci

echo "==> ローカル D1 migration を適用します"
mise exec -- npm run db:migrate

echo "==> worktree のセットアップが完了しました"

#!/usr/bin/env bash
# preview:cf 相当の環境（Next.js Worker + api-worker、サービスバインディング
# 有効）を実際に起動し、GET /api/health が 200 で ok:true を返すことを確認する。
#
# CI の build ジョブ（npm run build:cf）は OpenNext のビルドが成功するかしか
# 見ておらず、wrangler.jsonc の services 設定（サービスバインディング）が
# 正しく配線されているかはビルド成功では検証できない。このスクリプトは
# その隙間を埋める。
#
# CI とローカルの両方から `npm run smoke` で同じ手順を実行する。CI がここで
# 落ちたら、まずローカルで `npm run smoke` を動かして再現するのが最短の
# デバッグ経路になる（同じスクリプトを通るので、CI 固有の環境差分を疑う前に
# ロジック側の問題を切り分けられる）。
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 1

PORT="${SMOKE_PORT:-8788}"
URL="http://localhost:${PORT}/api/health"
LOG_FILE="$(mktemp)"
PID=""

cleanup() {
  if [[ -n "$PID" ]]; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ ! -f workers/.dev.vars ]]; then
  echo "==> workers/.dev.vars が無いのでサンプルからコピーします"
  cp workers/.dev.vars.example workers/.dev.vars
fi

echo "==> Building (OpenNext / Cloudflare)"
npm run build:cf

echo "==> Starting preview server on :${PORT} (Next.js + api-worker, service binding)"
# 疎通確認はローカルだけで完結させ、AI binding の追加で外部認証を要求しない。
npx wrangler dev --local -c wrangler.jsonc -c workers/wrangler.jsonc --port "$PORT" \
  >"$LOG_FILE" 2>&1 &
PID=$!

echo "==> Waiting for server to become ready"
ready=false
for _ in $(seq 1 30); do
  if curl -sf "$URL" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "$ready" != "true" ]]; then
  echo "server did not become ready within 30s" >&2
  echo "---- wrangler log ----" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

echo "==> Checking service binding: Next.js Worker -> api-worker"
body="$(curl -sf "$URL")"
echo "response: ${body}"

if [[ "$body" != *'"ok":true'* ]]; then
  echo "unexpected response from ${URL}: ${body}" >&2
  exit 1
fi

echo "==> OK: service binding is wired correctly"

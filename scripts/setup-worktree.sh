#!/usr/bin/env bash

set -euo pipefail

readonly project_dir="$(git rev-parse --show-toplevel)"

cd "$project_dir"

if ! command -v mise >/dev/null 2>&1; then
  echo "error: mise が見つかりません。https://mise.jdx.dev/ からインストールしてください。" >&2
  exit 1
fi

# node_modules は package-lock.json ごとに 1 つだけ保存し、APFS の clone（cp -c）で各 worktree へ配る。
# clone は書き換えるまで元とディスク上の実体を共有するので、worktree が何個あっても 1 個分で済む。
# ループは run ごとに worktree を作るため、npm ci だと 1 個約 1.7GB ずつ増えてディスクが尽きた（2026-11-25）。
# clone できない環境（macOS 以外・別ボリューム）や、すでに node_modules がある再実行では従来どおり npm ci。
readonly modules_cache_root="${IDEA_BOOST_MODULES_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/idea-boost/node_modules}"
readonly modules_cache_keep=3

modules_key() {
  {
    cat package-lock.json .npmrc
    mise exec -- node --version
    uname -sm
  } | shasum -a 256 | cut -c1-16
}

save_modules_cache() {
  local entry="$1"
  # mkdir が成功した 1 つの setup だけが書く。読む側は .complete が付くまで使わない
  mkdir -p "$modules_cache_root"
  mkdir "$entry" 2>/dev/null || return 0
  if cp -cRp node_modules "$entry/node_modules" 2>/dev/null; then
    touch "$entry/.complete"
    echo "==> node_modules をキャッシュに保存しました"
  else
    rm -rf "$entry"
    return 0
  fi
  # 新しい順に modules_cache_keep 個だけ残す。書きかけ（.complete なし）は 1 時間たったものだけ消す
  local old
  while IFS= read -r old; do
    rm -rf "${old%/.complete}"
  done < <(ls -1t "$modules_cache_root"/*/.complete 2>/dev/null | tail -n +$((modules_cache_keep + 1)))
  find "$modules_cache_root" -mindepth 1 -maxdepth 1 -type d -mmin +60 \
    -exec test ! -e '{}/.complete' ';' -exec rm -rf '{}' + 2>/dev/null || true
}

install_packages() {
  local entry=""
  if [[ "$(uname -s)" == Darwin && ! -e node_modules ]]; then
    entry="$modules_cache_root/$(modules_key)"
    if [[ -f "$entry/.complete" ]]; then
      if cp -cRp "$entry/node_modules" node_modules 2>/dev/null; then
        touch "$entry/.complete"
        echo "==> node_modules をキャッシュから複製しました（npm ci を省略）"
        # npm ci なら自動で走るルートの postinstall だけを実行する
        mise exec -- npm run postinstall --if-present
        return
      fi
      rm -rf node_modules
    fi
  fi
  mise exec -- npm ci
  if [[ -n "$entry" ]]; then
    save_modules_cache "$entry"
  fi
}

echo "==> mise のツールを準備します"
mise install

# .env.local と workers/.dev.vars を作る。1Password を読める Mac mini では .env.tpl の値も入れる
bash scripts/worktree-env.sh

echo "==> npm パッケージをインストールします"
install_packages

echo "==> ローカル D1 migration を適用します"
mise exec -- npm run db:migrate

echo "==> worktree のセットアップが完了しました"

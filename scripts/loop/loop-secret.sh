#!/bin/bash
# ループが使う秘密を、値を表示せずに取り出す。
#
#   loop-secret.sh read <名前>       値を標準出力へ（改行なし）。変数への代入やパイプにだけ使う
#   loop-secret.sh check <名前>      置き場所（1password / keychain）だけを表示する
#   loop-secret.sh gh-secret <名前>  値を標準入力で `gh secret set <名前>` に渡す
#
# 正本は 1Password の Automation 保管庫の項目 `idea-boost-<名前>` のフィールド `credential`。
# 無ければ移行期間の予備として macOS のキーチェーン `idea-boost/<名前>` を読む。
# 決まりは docs/loop/README.md の「秘密の置き場」。
set -uo pipefail

VAULT="Automation"
FIELD="credential"

usage() {
  echo "使い方: $0 read|check|gh-secret <名前>（例: CLOUDFLARE_API_TOKEN_LOOP）" >&2
  exit 2
}

[ $# -eq 2 ] || usage
command="$1"
name="$2"
case "$command" in read | check | gh-secret) ;; *) usage ;; esac
[[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || usage

item="idea-boost-${name}"
ref="op://${VAULT}/${item}/${FIELD}"

# op はサービスアカウントで読む。対話シェルの関数に頼らず、キーチェーンのトークンを渡す。
if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
  token=$(security find-generic-password -s op-service-account-token -w 2>/dev/null) || token=""
  [ -n "$token" ] && export OP_SERVICE_ACCOUNT_TOKEN="$token"
  unset token
fi

source_name=""
value=""
if command -v op >/dev/null 2>&1 && value=$(op read --no-newline "$ref" 2>/dev/null) && [ -n "$value" ]; then
  source_name="1password"
elif value=$(security find-generic-password -s "idea-boost/${name}" -w 2>/dev/null) && [ -n "$value" ]; then
  source_name="keychain"
else
  value=""
  cat >&2 <<EOF
${name} が見つからない。オーナーに 1Password の ${VAULT} 保管庫へ項目「${item}」（フィールド ${FIELD}）を保存してもらう（needs-human）。
EOF
  exit 3
fi

case "$command" in
  read) printf '%s' "$value" ;;
  check) echo "$source_name" ;;
  gh-secret) printf '%s' "$value" | gh secret set "$name" ;;
esac

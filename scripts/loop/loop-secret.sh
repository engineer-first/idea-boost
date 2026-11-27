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

# op はサービスアカウントで読む。対話シェルの関数に頼らず、キーチェーンのトークンを op にだけ渡す。
token="${OP_SERVICE_ACCOUNT_TOKEN:-}"
if [ -z "$token" ]; then
  token=$(security find-generic-password -s op-service-account-token -w 2>/dev/null) || token=""
fi

source_name=""
value=""
missing_reason="1Password の ${VAULT} 保管庫に項目「${item}」（フィールド ${FIELD}）が無い"
# 予備へ進むのは、1Password が「項目・フィールドが無い」と答えたときだけ。
# それ以外（トークンが無い・切れた、op が無い、通信・権限）は、古い予備を黙って使わずに止める。
if [ -z "$token" ]; then
  echo "${name} を 1Password から読めない（予備は使わない）: サービスアカウントのトークン（環境変数 OP_SERVICE_ACCOUNT_TOKEN、またはキーチェーンの op-service-account-token）が無い（needs-human）。" >&2
  exit 3
elif ! command -v op >/dev/null 2>&1; then
  echo "${name} を 1Password から読めない（予備は使わない）: 1Password CLI（op）が入っていない。" >&2
  exit 3
else
  err_file=$(mktemp)
  trap 'rm -f "$err_file"' EXIT
  if value=$(OP_SERVICE_ACCOUNT_TOKEN="$token" op read --no-newline "$ref" 2>"$err_file"); then
    if [ -z "$value" ]; then
      echo "${name} を 1Password から読めない（予備は使わない）: 「${item}」の ${FIELD} が空（needs-human）。" >&2
      exit 3
    fi
    source_name="1password"
  elif ! grep -qE "isn't an item|isn't a field|does not have a field" "$err_file"; then
    echo "${name} を 1Password から読めない（予備は使わない）: $(tr '\n' ' ' <"$err_file")" >&2
    exit 3
  else
    value=""
  fi
  rm -f "$err_file"
fi
unset token

if [ -z "$source_name" ]; then
  if value=$(security find-generic-password -s "idea-boost/${name}" -w 2>/dev/null) && [ -n "$value" ]; then
    source_name="keychain"
    echo "${missing_reason}ため、移行期間の予備（キーチェーン idea-boost/${name}）を使った。1Password の ${VAULT} 保管庫へ「${item}」として移す。" >&2
  else
    echo "${name} を読めない。${missing_reason}。キーチェーンの予備 idea-boost/${name} も無い（needs-human）。" >&2
    exit 3
  fi
fi

case "$command" in
  read) printf '%s' "$value" ;;
  check) echo "$source_name" ;;
  gh-secret) printf '%s' "$value" | gh secret set "$name" ;;
esac

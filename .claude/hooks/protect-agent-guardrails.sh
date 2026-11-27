#!/usr/bin/env bash
set -euo pipefail

PAYLOAD=$(cat)
FILE=$(jq -r '.tool_input.file_path // empty' <<<"$PAYLOAD")

[[ -z "$FILE" ]] && exit 0

BASENAME=$(basename "$FILE")
NEW_TEXT=$(
  jq -r '
    [
      .tool_input.content?,
      .tool_input.new_string?,
      (.tool_input.edits[]?.new_string?)
    ]
    | map(select(type == "string"))
    | join("\n")
  ' <<<"$PAYLOAD"
)
OLD_TEXT=$(
  jq -r '
    [
      .tool_input.old_string?,
      (.tool_input.edits[]?.old_string?)
    ]
    | map(select(type == "string"))
    | join("\n")
  ' <<<"$PAYLOAD"
)
HAS_FULL_CONTENT=$(jq -r '(.tool_input.content? | type) == "string"' <<<"$PAYLOAD")

deny() {
  cat >&2 <<EOF
$1
EOF
  exit 2
}

contains_script() {
  local script_name="$1"
  grep -Eq "\"${script_name}\"[[:space:]]*:" <<<"$NEW_TEXT"
}

script_is_empty() {
  local script_name="$1"
  grep -Eq "\"${script_name}\"[[:space:]]*:[[:space:]]*\"[[:space:]]*\"" <<<"$NEW_TEXT"
}

script_was_removed() {
  local script_name="$1"
  grep -Eq "\"${script_name}\"[[:space:]]*:" <<<"$OLD_TEXT" &&
    ! grep -Eq "\"${script_name}\"[[:space:]]*:" <<<"$NEW_TEXT"
}

if [[ "$BASENAME" == "CLAUDE.md" ]]; then
  deny "Refusing to edit CLAUDE.md directly. Edit AGENTS.md and keep CLAUDE.md as a symlink to AGENTS.md."
fi

# .env.tpl は 1Password の参照（op://）だけを置くテンプレート。値の行が混ざる編集は止める
if [[ "$BASENAME" == ".env.tpl" ]]; then
  # grep -q は早く終わって前段を SIGPIPE で落とし、pipefail で判定が偽になるので awk 1 回で数える
  if ! awk '
    /^[[:space:]]*(#.*)?$/ { next }
    /^[A-Z][A-Z0-9_]*=op:\/\/Automation\/idea-boost-[A-Z][A-Z0-9_]*\/credential$/ { next }
    { bad = 1 }
    END { exit bad }
  ' <<<"$NEW_TEXT"; then
    deny "Refusing to edit .env.tpl with a plain value. Keep only NAME=op://Automation/idea-boost-<NAME>/credential references and comments."
  fi
  exit 0
fi

if [[ "$BASENAME" == ".env" || "$BASENAME" == .env.* ]] && [[ "$BASENAME" != ".env.example" ]]; then
  deny "Refusing to edit ${BASENAME}. Secret files must be edited by a human. Update .env.example for template changes."
fi

if [[ "$BASENAME" == tsconfig*.json ]]; then
  if grep -Eq '"strict"[[:space:]]*:[[:space:]]*false' <<<"$NEW_TEXT"; then
    deny "Refusing to disable TypeScript strict mode."
  fi

  if grep -Eq '"strict"[[:space:]]*:[[:space:]]*true' <<<"$OLD_TEXT" &&
    ! grep -Eq '"strict"[[:space:]]*:' <<<"$NEW_TEXT"; then
    deny "Refusing to remove TypeScript strict mode."
  fi

  if [[ "$HAS_FULL_CONTENT" == "true" ]] &&
    ! grep -Eq '"strict"[[:space:]]*:[[:space:]]*true' <<<"$NEW_TEXT"; then
    deny "Refusing to write a tsconfig without TypeScript strict mode."
  fi
fi

if [[ "$BASENAME" == "biome.json" ]]; then
  if grep -Eq '"enabled"[[:space:]]*:[[:space:]]*false' <<<"$NEW_TEXT"; then
    deny "Refusing to disable Biome formatter or linter."
  fi
fi

if [[ "$BASENAME" == "package.json" ]]; then
  for script_name in lint typecheck test; do
    if script_is_empty "$script_name"; then
      deny "Refusing to empty the package.json ${script_name} script."
    fi

    if script_was_removed "$script_name"; then
      deny "Refusing to remove the package.json ${script_name} script."
    fi

    if [[ "$HAS_FULL_CONTENT" == "true" ]] && ! contains_script "$script_name"; then
      deny "Refusing to write package.json without the ${script_name} script."
    fi
  done
fi

exit 0

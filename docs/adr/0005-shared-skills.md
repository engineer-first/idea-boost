# 0005: 共有スキルの正本を .agents/skills に統一する

- 状態：提案
- 決定日：未定（PR レビューで採用を判断する）
- 記録日：2026-10-04

## 背景

共有スキルの実体が `.agents/skills/`・`.claude/skills/`・`.codex/skills/` に分散し、
同名の `pbi-demogoal` に更新差分が生じていた。`write-pr` は `.agents` から `.claude` への
symlink であり、編集場所も統一されていなかった。1か所の編集を両エージェントへ反映したい。

## 候補と決定

共有スキルの正本を `.agents/skills/<skill-name>/` に揃え、Claude Code は
`.claude/skills/<skill-name>` の相対 symlink から参照する。付属ファイルと表示・呼び出し設定も
正本へまとめる。Codex は正本を直接探索できるため、`.codex/skills/` の互換リンクは残さない。

複数の実体を同期する方式は更新漏れが残るため採用しない。`.claude/skills/` を正本にする方式も
Codex 側の参照を追加する必要があり、ツールに依存しない編集場所として `.agents/skills/` を選ぶ。
共通の正本の場所は、両製品共通の公式指定ではなく、本リポジトリの設計判断である。

## 影響と見直す条件

指示・scripts・references を1回編集すれば両方へ反映され、文書リンクも正本へ揃えられる。
Claude Code 用の symlink は新規スキル追加時にも用意し、Git の symlink を保持できる環境が必要になる。
明示呼び出し専用の条件は各ランタイムのメタデータで維持する。
hooks・設定やユーザーレベルのスキルはこの集約の対象にしない。

公式の探索場所・symlink 対応が変わる場合、または symlink を保持できない開発環境を
サポートする必要が生じた場合に見直す。

## 根拠

- [Issue #528](https://github.com/engineer-first/idea-boost/issues/528)：移行内容と完了条件。
- [Codex の探索場所](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)：リポジトリの `.agents/skills/` を探索し、スキルディレクトリの symlink に対応する。
- [Claude Code の探索場所](https://code.claude.com/docs/en/skills#choose-where-skills-load)：`.claude/skills/` のスキルディレクトリから別の実体を symlink で参照できる。
- [Agent Skills の構成](https://agentskills.io/specification#directory-structure)：`SKILL.md` と付属ファイルをスキルディレクトリにまとめる。
- 編集・追加・検証の手順は[エージェント指示の保守](../development/agent-maintenance.md#共有スキルの正本)を参照する。

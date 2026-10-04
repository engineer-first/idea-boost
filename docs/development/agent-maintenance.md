# エージェント指示の保守

通常の実装では読む必要はない。指示・skill・hookを変更するときに使う。入口は[AGENTS.md](../../AGENTS.md)、作業別規範は[開発規約](conventions.md)、検証の選択は[テスト方針](testing.md)。採用理由と実走結果は[2026年9月以降の保守記録](../archive/agent-guidance-maintenance-2026-09.md)に残す。

## 保守する場所

- 常時必要な判断はAGENTS、作業別知識は参照先へ置く。静的検査できる細則は[ast-grep](../../rules/ast-grep/)・[配置検査](../../scripts/check-feature-layout.mts)・[DB lint](../../.tbls/)へ委譲する。
- [Claude設定](../../.claude/settings.json)と[Codex hooks](../../.codex/hooks.json)は別ランタイム。片方の実行結果をもう一方の保証にしない。
- `CLAUDE.md`はAGENTSへのsymlinkを維持する。参照先の移動ではAGENTS・skill・hook・コードコメントの経路を確認する。
- `.eval-loop/`はローカル作業状態。コミットせず、既存状態を削除しない。Markdown整形は変更対象を列挙する。
- Claude互換frontmatterの`argument-hint` / `disable-model-invocation`はCodex用validatorの制約と区別する。形式検証のために削除しない。

## 共有スキルの正本

共有スキルは `.agents/skills/<skill-name>/` に実体を置き、`SKILL.md` と付属する
`scripts/`・`references/`・`assets/`・`agents/` を同じディレクトリで管理する。
編集と文書からのリンクはこの正本へ揃える。Claude Code は各スキルを
`.claude/skills/<skill-name> -> ../../.agents/skills/<skill-name>` の相対 symlink で参照する。
新規追加時も実体と symlink をセットで用意する。

`.codex/skills/` に実体や互換リンクは置かない。Codex は `.agents/skills/` から読む。
明示呼び出し専用の条件は Claude Code の `disable-model-invocation: true` と
Codex の `agents/openai.yaml` の `policy.allow_implicit_invocation: false` で保つ。
ツール固有の hooks・設定は従来の場所で管理し、`akapen` などのユーザースキルと
作業成果物は共有しない。採用理由と公式仕様は [ADR 0005](../adr/0005-shared-skills.md)を参照する。

移動・追加後は、両ランタイムのスキル一覧で対象が1件ずつ読み込まれること、
symlink にリンク切れがないこと、付属ファイルと文書リンクが両経路から解決できることを確認する。
Issue 作成は `--dry-run`、リリース操作は fake operator を使い、検証のための公開操作は行わない。

## 参照ルーティングを確認する

ルートから次の経路を読み合わせ、必要な制約に到達することを確認する。これはagentの実走評価を代替しない。

| 作業               | 到達する規範                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| READMEの文言       | 文書のリンク・記載内容・整形検証                                                                                   |
| Issue作成・編集    | Issue運用の種類・PBI整理・sprint自動割当・Project状態・PR対応・App権限                                             |
| Nextの付箋UI       | 配置・Next同梱ガイド・UI・テスト方針。red先行、container/view、stories、適用される状態。共有状態変更なら認可も読む |
| ガイドの固定文言   | テスト方針からstory・文章・表示レビュー。表示条件の変更ならred先行                                                 |
| ボタンとhookの接続 | UI・テスト方針からDOM操作とcallback・状態変化                                                                      |
| 新しいUI部品       | new-componentからUI・テスト方針。storiesを維持し、親と専用specの重複を判断                                         |
| APIの閲覧権限      | 配置・API・共有状態と認可。否定系、visibleTo、Workerテスト                                                         |
| RoomDOのカラム     | 配置・Migration。red先行、マージ済みSQLの不変性、新規SQL、生成物非コミット、DB lint・Workerテスト                  |

リンク・アンカー・npm scriptの存在、symlink、再整形の差分ゼロ、`git diff --check`、`git check-ignore .eval-loop/`を確認する。コマンドとCIの正本は[package.json](../../package.json)と[CI](../../.github/workflows/ci.yml)。

## releaseとPRの入口

[release](../../.agents/skills/release/SKILL.md)は明示呼び出し専用。変更時は`$release`と`$release 今回の変更を確認したい`で本文が選択され、リリース相談・次版の要望・ノートレビュー・デプロイ説明では選択されない6入力を再確認する。外部操作はfake operatorへ差し替え、公開の副作用を起こさない検証を行う。

[write-pr](../../.agents/skills/write-pr/SKILL.md)からPRテンプレートとGitHub上の画面資料へ到達することを確認する。Issueの画面イメージと追加の再現資料の置き方は[Issue運用](../team/issues.md)を参照する。

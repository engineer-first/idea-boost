---
name: ci-triage
description: idea-boost の GitHub Actions が失敗したときに、対象コミットと失敗ステップを特定し、ローカル再現・修正・再確認を進める。CIが何を保証するかの調査にも使う。
---

# CIの失敗を調べる

最初に対象PR・head SHA・失敗したrunとattemptを揃える。
以下のコマンドはリポジトリルートで実行する。

```sh
gh pr view <PR番号> --json url,headRefName,headRefOid,baseRefName,statusCheckRollup
gh run view <run-id> --json headSha,event,attempt,jobs,url
gh run view <run-id> --log-failed
```

PRが指定されていなければ、現在のブランチのPRを確認する。
push後に古いrunを見ていないか、`pull_request` のマージ結果とheadで差がないか確認する。
ローカルの未コミット変更は保持する。失敗版の再現が必要なら別worktreeを使う。

## 失敗したステップから再現する

コマンドと前処理は対象版の [CI](../../../.github/workflows/ci.yml) と
[package.json](../../../package.json) を読む。検査の目的は
[テスト方針](../../../docs/development/testing.md) に照らす。

| 失敗箇所      | 確認すること                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| lint          | Biome、Markdown、境界、配置、共有スキル、型、migration、DB lintのどのステップか。整形hookの発火だけでlint成功とはしない |
| test          | unit / Worker / Preview / verification のどこで失敗したか。Worker・D1・DOの再現には対象のWorker用configを使う           |
| browser       | Storybook build・配信の失敗か、実ブラウザの操作・寸法の失敗か。`board-layout` artifactの画像とログを確認する            |
| build / smoke | buildログとサービスバインディングの起動・疎通を分けて確認する                                                           |

原因に応じて、次を調べる。

- 仕様・権限・タイマー条件が変わった場合は、本番実装、fixture、story、テストの前提を照合する。失敗した期待値だけを現状に合わせない。
- 時刻依存の失敗は、要求ID・期限などが同じ基準時刻から生成されるかを見る。
- 単独では通る失敗は、共有ファイル、git index、ポート、タイマー、後始末の競合を調べる。
- browserで押せない場合は、実際のhit target、重なり、viewportを観測する。固定座標の書き換えだけで製品の操作不具合を隠さない。

振る舞いの修正は [AGENTS.md](../../../AGENTS.md#開発と検証) のred先行に従う。
既存テストが失敗するならその再現記録を使い、新しい不具合なら最小の回帰テストから始める。
retry・timeoutの増加、検査の削除・緩和だけで修正完了にしない。
仕様変更で検査が不要になった場合は、旧要件と新要件、残す保証を説明する。

## 結果を確かめる

対象の再現テストをgreenにし、関連する検査を実行する。
pushまで依頼されていればpushし、そのコミットの新しいrunを確認する。
調査だけの依頼では、修正・push・再実行・コメント投稿へ範囲を広げない。

報告は原因、修正、対象SHA、確認したjob/stepと結果、未確認事項を短く示す。
ローカル成功とGitHub上の成功、CIと外部サービスの制限・保留を区別する。
一部のjobが成功しただけで「CI全成功」としない。PRを作成・更新するときは
[write-pr](../write-pr/SKILL.md) に従う。

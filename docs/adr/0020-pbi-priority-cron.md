# 0020: PBI優先順位の定期同期をCloudflare Cronへ移す

- 状態：提案
- 決定日：未決定
- 記録日：2026-10-29

## 背景

PBIのドラッグ順が正本だが、優先順位フィールドは別途採番が必要。Actionsに5分周期を設定しても、2026-10-28〜29の起動間隔は約3〜7時間だった。起動したジョブは数秒で開始し、数十秒で採番と再読取検証を完了している。公開リポジトリの標準ランナーであり、実行時間無料枠の枯渇ではない。別の定期workflowにも同様の起動間隔が見られた。

切り分けられた故障箇所はActionsの定期起動。GitHub内部の遅延・欠落の理由は公開ログでは確定できない。GitHubはscheduleの遅延・取りこぼしを仕様として明記しており、5分以内の反映をこの起動元へ依存させられない。

## 候補と決定

専用Cloudflare WorkerのCronから、既存の採番処理を直接実行する。GitHub Actionsはデプロイと手動確認に使い、定期実行の経路から外す。プロダクトのAPI WorkerやDBには依存させない。

- Actionsのcronの分をずらす案は、混雑を避ける効果はあっても起動欠落への依存が残るため採用しない。
- 外部cronからActionsをdispatchする案は、ランナー待ちとActions書き込み権限が加わるため採用しない。
- Project webhook案は、既存Appの購読変更・受信認証が必要になるため今回は採用しない。

## 影響と見直す条件

5分周期の実行元と実行結果をCloudflareで管理する。新しいWorkerと、既存App秘密鍵のCloudflare Secretへの配置が必要。既存のissues read / organization projects writeを超える権限は追加しない。更新前後の読取検証と競合時の失敗は維持する。

Cloudflareの障害・GitHub APIの制限では反映が遅れる可能性は残る。厳密な即時反映や配信保証が必要になればwebhookと再試行キューを検討する。停止にはActions無効化ではなくCron Triggerの停止が必要。

## 根拠

- [定期起動の制約](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [11:51の定期実行：起動後に8件更新](https://github.com/engineer-first/idea-boost/actions/runs/40808787264)
- [13:24の手動実行：11件更新・再読取検証](https://github.com/engineer-first/idea-boost/actions/runs/40817527258)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [同期の運用](../team/issues.md#pbiのドラッグ順と優先順位)

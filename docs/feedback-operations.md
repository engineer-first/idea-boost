# 意見の収集と閲覧

Issue #386 の任意投稿を、共有成果とは独立した閲覧権限と期限で管理する。
投稿者の個人情報は記録せず、意見の本文・種類・対象・任意の使いやすさ評価・ルームID・受付ID・受信時刻・期限だけをD1に保存する。

## 収集開始前

- D1 migration `0005_feedback.sql` を適用し、対応するアプリとAPI Workerを配置する。
- API Worker の `triggers.crons` にある `0 * * * *` が配置されていることを確認する。期限による取得拒否は定期処理とは独立して働く。
- `/privacy` の意見説明と、入力欄の説明が表示されることを確認する。
- 閲覧担当者が本番へGoogleログインした後、運営者が既存の管理コマンドで明示的に権限を付与する。既存の成果閲覧者へ自動付与しない。

```sh
npm run access:grant -- feedback:read reader@example.com
npm run access:revoke -- feedback:read reader@example.com
npm run access:list
```

これらの権限コマンドは本番D1を対象にする。ローカル検証では開発ユーザーの権限も明示的に設定する。

## 確認する

`/feedback` で種類・対象・日時を絞り、新しい順に50件ずつ読む。
「文章なし（種類のみ）」と評価「未回答」を区別する。投稿数は回答人数ではなく、無回答は好評や問題なしを示さない。
共有成果の権限も持つ場合は、ルームの共有成果へ移動できる。成果が意見より先に期限を迎えている場合は、成果画面で期限終了を案内する。

通常の参加者・ルーム作成者には投稿内容を配信しない。閲覧権限を取り消した後は、同じログイン状態でも次のAPI取得を拒否する。
すでに閲覧者へ渡った内容を端末から回収する機能はない。

## 保存期間と削除

送信から30日で閲覧を停止する。閲覧・再送・ルームの利用で期限を延長しない。
受付IDはランダム部分を持つUUIDv7を使う。未保存のIDは端末での発行時刻とサーバー時刻の差が24時間以内の場合だけ受け付け、期限削除後の古いIDによる再送で投稿を復活させない。既存IDの再送は初回のサーバー受信時刻と期限を維持する。端末の時計が24時間以上ずれている場合は日時を修正し、入力を保持したまま「新しい意見として送信」でIDを更新できる。IDの時刻を保存期限の基準にはしない。

ルームの解散でも意見は即削除しない。1時間ごとの定期処理で期限切れを削除し、失敗した場合は次回再試行する。
Worker の定期実行の失敗は運用画面で確認する。ログへ意見本文を追加しない。

緊急削除では本文・ルーム等の投稿記録を直ちに削除し、受付IDのSHA-256ハッシュと失効時刻だけを記録する。同じIDで再受付し得る失効期間は最長48時間で、期間終了後に毎時の処理で物理削除する。削除処理に失敗した場合は次回再試行するため、その間はハッシュが残る。受付IDそのもの・本文・ルーム・投稿者は失効記録に残さない。通常の再送は同じIDで重複防止し、緊急削除されたIDは再送しても復活させない。

失効登録のINSERTからSQLite triggerで本文を削除し、投稿INSERTも同じDB内のtriggerで失効IDを拒否する。どちらの操作が先でも削除完了後に同IDを保存できない。CLIはこの1文だけを実行し、複数SQLを別々に実行する手順にはしない。既存の失効登録を再実行しても、UUIDv7の発行時刻から定まる再受付窓は延長しない。

緊急削除は受付IDと実行対象を指定する。コマンドは本文を表示しない。個人の投稿履歴や編集・削除画面は提供しない。

```sh
npm run feedback:delete -- aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa --local
npm run feedback:delete -- aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa --remote
```

`--remote` は本番の意見を削除するため、対象の受付IDを確認して実行する。

## ローカルの確認経路

- `npm run test:workers -- workers/feedback.spec.ts workers/access.spec.ts workers/visibility.spec.ts`
- `npm run test -- features/feedback features/room/molecules/room-outcome-view.spec.tsx`
- Storybook の `Feedback/FeedbackPanel`、`Feedback/FeedbackListView`、`Room/RoomOutcomeView` の `WithFeedback`。
- Storybook配信後、`npm run test:browser -- tests/browser/feedback.spec.ts`。

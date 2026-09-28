# 共有成果の保存と閲覧権限

通常開発・検証・本番は同じ RoomDO の保全、再試行、30日の期限判定を使います。保存先は環境ごとに分離され、全ルームの成果一覧・詳細は Google または開発用アカウントでログインした、`shared_outcomes:read` を持つユーザーだけが `/shared-outcomes` から閲覧できます。Worker は取得のたびにセッションと D1 の現在の権限を確認します。

| 環境     | 起動・保存先                                                       | 初期権限                                                                       |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 通常開発 | `npm run dev` と `npm run dev:api`。通常の Wrangler ローカル保存先 | 開発用ログイン時、`DEV_USERS[0]` の Owner に read と manage\_access を自動登録 |
| 検証     | `npm run dev:verify`。`.wrangler/verification/state`               | 同じ Owner に自動登録                                                          |
| 本番     | 本番 Worker・D1・RoomDO                                            | 運用 CLI で既存ユーザーに明示的に登録                                          |

`npm run dev` だけでは Next.js のみ起動します。通常開発の D1 migration は `dev:api` 起動時に適用されます。検証環境は専用 D1 に migration を適用します。

## 本番の初期権限

本機能を含む版を公開し、D1 migration を適用した後、`junhat6@gmail.com` で本番へ一度 Google ログインしてください。その後、Cloudflare に認証できる運用環境から次を実行します。ユーザーが `users` にまだ存在しない場合、CLI はユーザーを作らず、先にログインするよう案内して停止します。

```bash
npm run access:grant -- shared_outcomes:read junhat6@gmail.com
npm run access:grant -- shared_outcomes:manage_access junhat6@gmail.com
npm run access:list
```

権限の緊急変更には `npm run access:revoke -- shared_outcomes:manage_access メールアドレス` を使えます。CLI は本番 D1 を明示的に対象とし、永続的なメールアドレス特例は設けません。

## 閲覧者の管理

`shared_outcomes:manage_access` を持つユーザーは `/admin/access` で登録済みユーザーに read 権限を付与・剥奪できます。対象ユーザーは事前に Google ログインを済ませてください。この画面と API から manage\_access 自体を変更することはできません。Worker が操作のたびに管理権限を確認します。

## 保存・失敗・期限

共有成果はRoomDOで保全し、D1の成果専用投影へ非同期で反映する。ルーム作成と成果の初期索引は同じD1 batchで作り、本文の反映と索引の更新はバックグラウンドで行う。D1のルーム一覧には共有本文を含めない。完了時はその時点の盤面を固定し、後からボードに戻っても書き換えない。共有から個人用へ戻した付箋は次の途中記録から除外する。

反映に失敗した場合は保全した記録で自動再試行する。閲覧側は前回の成功分と保存失敗を示し、一般ユーザーへ追加操作を求めない。期限は作成・最後の共有操作から30日で、閲覧や再試行では延長しない。期限後は閲覧を止めて削除し、削除失敗はWorkerログの `shared-outcome-expiry-delete-failed` で検知する。投影失敗は `shared-outcome-projection-failed`。ログには秘密値や共有本文を出さない。

既存ルームは通常アクセス・成果一覧取得時に成果の保全を初期化する。導入前の最後の共有操作時刻は記録されていないため、旧ルームの作成日時を期限の起点にし、初回閲覧によって期間を延ばさない。導入前の削除済みルームや未保存の編集履歴は復元できない。デプロイ前にD1 migrationを適用する。

検証手順とやり直しは [ローカル検証環境](local-verification.md) を参照する。Storybookとモックは見た目の確認用で、永続化・認可・再試行・期限の保証には使わない。

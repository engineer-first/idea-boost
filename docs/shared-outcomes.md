# 共有成果の保存と秘密リンク

通常開発・検証・本番は同じRoomDOの保全、再試行、30日の期限判定を使い、保存先と閲覧設定を分離する。閲覧設定がなくても通常操作と保存は動き、成果一覧へのアクセスだけを拒否する。

| 環境     | 起動・保存先                                                     | 閲覧設定                                                      |
| -------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| 通常開発 | `npm run dev` と `npm run dev:api`。通常のWranglerローカル保存先 | `workers/.dev.vars` の `SHARED_OUTCOMES_TOKEN`                |
| 検証     | `npm run dev:verify`。`.wrangler/verification/state`             | `.wrangler/verification/outcomes-token`。初回に生成して再利用 |
| 本番     | 本番Worker・D1・RoomDO                                           | 管理者がWorkerのsecretに登録                                  |

`npm run dev` だけではNext.jsのみ起動する。別の保存方式や本番へのフォールバックはない。通常開発にサンプルは自動投入せず、再起動でもデータを保持する。

## 発行・置換・削除

通常開発用リンクを発行する。リンクは標準出力や起動ログに出さず、指定したファイルへ所有者のみ読み書きできる権限で保存する。保存先をGitや共有フォルダーに入れない。

```bash
npm run outcomes:link -- issue local http://localhost:3000 /tmp/idea-boost-local-link.txt
```

`issue local` は既存の有効な値を再利用する。置換には `rotate`、削除には `revoke` を使う。変更後に `dev:api` を再起動する。

```bash
npm run outcomes:link -- rotate local http://localhost:3000 /tmp/idea-boost-local-link.txt
npm run outcomes:link -- revoke local
```

本番はCloudflareへの管理者認証が必要。次のコマンドはWranglerのsecret操作を通じて設定を変更する。初回以降は同じ保存済みリンクを使い続ける。本番で `issue` を再実行すると新しい値で置き換わる。

```bash
npm run outcomes:link -- issue production https://ideaboost.dev /tmp/idea-boost-production-link.txt
npm run outcomes:link -- rotate production https://ideaboost.dev /tmp/idea-boost-production-link.txt
npm run outcomes:link -- revoke production
```

リンクは `/shared-outcomes#token=...` 形式。fragmentはHTTPのリクエストURLへ送られず、データ取得時にBearerヘッダーで照合する。リンクを転送された人も全ルームの保存期間内の成果を見られる。閲覧専用で、管理・状態準備の権限はない。有効な設定は同時に1件で、設定変更が反映された後の次のデータ取得から旧リンクを拒否する。

検証用リンクの取得はOwnerで `/dev/verify` の「成果閲覧リンクを取得」を使う。差し替えはサーバー停止後に次を実行して再起動する。

```bash
npm run outcomes:link -- rotate verification http://localhost:3000 /tmp/idea-boost-verification-link.txt
```

検証の `revoke` は現在の保存値を削除する。再起動時には検証環境を利用可能にするため新規発行するので、旧リンクは無効になる。検証領域を初期化しても通常開発・本番の設定には影響しない。

## 保存・失敗・期限

共有成果はRoomDOで保全し、D1の成果専用投影へ非同期で反映する。ルーム作成と成果の初期索引は同じD1 batchで作り、本文の反映と索引の更新はバックグラウンドで行う。D1のルーム一覧には共有本文を含めない。完了時はその時点の盤面を固定し、後からボードに戻っても書き換えない。共有から個人用へ戻した付箋は次の途中記録から除外する。

反映に失敗した場合は保全した記録で自動再試行する。閲覧側は前回の成功分と保存失敗を示し、一般ユーザーへ追加操作を求めない。期限は作成・最後の共有操作から30日で、閲覧や再試行では延長しない。期限後は閲覧を止めて削除し、削除失敗はWorkerログの `shared-outcome-expiry-delete-failed` で検知する。投影失敗は `shared-outcome-projection-failed`。ログには秘密値や共有本文を出さない。

既存ルームは通常アクセス・成果一覧取得時に成果の保全を初期化する。導入前の最後の共有操作時刻は記録されていないため、旧ルームの作成日時を期限の起点にし、初回閲覧によって期間を延ばさない。導入前の削除済みルームや未保存の編集履歴は復元できない。デプロイ前にD1 migrationを適用する。

検証手順とやり直しは [ローカル検証環境](local-verification.md) を参照する。Storybookとモックは見た目の確認用で、永続化・認可・再試行・期限の保証には使わない。

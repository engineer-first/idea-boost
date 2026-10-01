# 本番の認証と閲覧権限

本番の権限操作はリポジトリルートから実行する。CLIは[workers/wrangler.jsonc](../../workers/wrangler.jsonc)の本番D1を`--remote`で操作する。ローカル権限の変更には使わない。

## 前提を確認する

1. 対応するアプリ・API WorkerとD1 migrationを公開済みであることを確認する。
2. 権限を付ける人が[本番アプリ](https://ideaboost.dev)へ一度Googleログインする。CLIは未登録ユーザーを作らない。
3. `npm ci`を済ませ、D1を操作できるCloudflareアカウントでWranglerへ認証する。

ローカル端末では次を実行し、ブラウザでログインを完了する。

```sh
npx wrangler login
npx wrangler whoami
```

本番D1の所有アカウントはWrangler設定の `account_id` で明示しているため、複数アカウントに所属していても非対話CLIで選択できる。[Cloudflare公式の設定説明](https://developers.cloudflare.com/workers/wrangler/configuration/#inheritable-keys)も参照する。

ブラウザログインを使わないCI等では、対象アカウントのD1操作権限を持つAPI tokenを`CLOUDFLARE_API_TOKEN`に設定する。値は秘密として管理し、文書やGitへ保存しない。設定方法は[Cloudflare公式のAPI token作成手順](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)を参照する。

## 必要な権限を選ぶ

| 権限                            | できること                                 | 確認する画面       |
| ------------------------------- | ------------------------------------------ | ------------------ |
| `shared_outcomes:read`          | 全ルームの共有成果・進行記録を閲覧         | `/shared-outcomes` |
| `shared_outcomes:manage_access` | 登録済みユーザーの成果閲覧権限を付与・剥奪 | `/admin/access`    |
| `feedback:read`                 | 参加者が任意に投稿した意見を閲覧           | `/feedback`        |

3権限は独立している。成果の閲覧者に意見の閲覧権限を自動付与しない。`/admin/access`から管理権限や意見の権限自体は変更できない。

## 付与して確認する

初期の運営者が3つの役割を兼ねる場合の例。担当が異なる場合は必要な権限だけを対象メールへ付与する。

```sh
npm run access:grant -- shared_outcomes:read junhat6@gmail.com
npm run access:grant -- shared_outcomes:manage_access junhat6@gmail.com
npm run access:grant -- feedback:read junhat6@gmail.com
npm run access:list
```

一覧に対象メールと付与した権限があることを確認し、本人が上表の画面を開く。データがない場合は空状態になる。Workerは取得・操作のたびにセッションとD1の現在の権限を確認する。

## 取り消す

```sh
npm run access:revoke -- feedback:read reader@example.com
npm run access:revoke -- shared_outcomes:manage_access reader@example.com
npm run access:list
```

権限一覧と次の取得が拒否されることを確認する。すでに端末へ渡った内容を回収する機能はない。

## 失敗時

| 表示・状況                                                  | 確認すること                                                                                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `In a non-interactive environment ... CLOUDFLARE_API_TOKEN` | CLIがWranglerを非対話で呼ぶため未認証のままログインできない。先に端末で`wrangler login`を完了するか、実行環境にtokenを設定する                                                                              |
| `More than one account available ... non-interactive mode`  | 最新のWrangler設定に `account_id` があるか確認する。旧版で実行する場合は `CLOUDFLARE_ACCOUNT_ID=b50fc9e60dea7830912d07e616822266 npm run access:grant -- feedback:read reader@example.com` のように指定する |
| Idea Boostに未登録という案内                                | 対象ユーザーが本番Googleログインを済ませたか                                                                                                                                                                |
| D1へのアクセス拒否                                          | `wrangler whoami`のアカウント、対象D1とtokenの権限                                                                                                                                                          |
| 付与済みでも画面が開けない                                  | 操作したメールと実際のログインアカウント、`access:list`の結果                                                                                                                                               |

## 機能ごとの運用とローカル検証

保存失敗・期限は[共有成果](shared-outcomes.md)、意見の期限・緊急削除は[意見の運用](feedback.md)を参照する。通常開発・検証ではOwnerの成果read / manage\_accessが開発ログイン時に自動登録される。意見の権限は自動付与しない。検証環境の準備と確認は[ローカル検証](../development/local-verification.md)。

実装の正本は[権限定義](../../contracts/access.ts)と[運用CLI](../../scripts/access.mts)。

<!-- 読者: Preview基盤をレビューする開発者。説明なしで使ってよい語: 一般語、Issue、Cloudflare、セッション、PR、Preview、App、API、D1、RoomDO、namespace、Worker、Workers Preview、Google、Access、Secret、SQL、migration、CI、runner、build、bundle、artifact、develop、マージ、JWT、Cookie、export、Service Binding、fallback、URL、署名、鍵。 -->

# 0012: PR Previewの画面・API・保存先をPRごとに分ける

- 状態: 採用
- 決定日: 2026-10-11
- 記録日: 2026-10-11
- 対象: [Issue #362](https://github.com/engineer-first/idea-boost/issues/362)
- 前の案: [0011](0011-pr-preview-identity.md)

## 背景

PR #587の画面は公開できましたが、APIがdevelop版のため、戻り先の情報が届かず「直前のステップに戻る」が表示されませんでした。初版では、APIを変更するPRの動作を確認できず、利用者が期待する動作確認を行えません。2026-10-11、利用者は画面・API・ルームの保存処理を含むPR全体をマージ前に確認する方針へ変更しました。

## 決定

PRのAppとAPIを同じWorkers Previewへまとめます。App内からAPIを呼ぶ場合も、同じプログラム内のAPI処理へ接続します。CloudflareのService Bindingは別Workerの対応するPreviewへ接続できないため、PRごとの別API Previewへの接続には使いません。

D1はPRごとに用意し、PRのmigrationをそのD1だけに適用します。同じWorkerからexportしたPreview用のRoomDOを使い、CloudflareがPreviewごとに分けるnamespaceへ接続します。異なるPRと本番の保存先を共有しません。

CIの元の鍵・PR番号・D1の識別値を使い、PR専用のセッション鍵を作ります。Workerへ元の鍵を渡さず、他PRのセッションを再利用できなくします。PRを開き直してD1を作り直した場合も鍵を変えます。接続確認の鍵もPRごとに作ります。本人のGoogleアカウントでのログイン、許可一覧、Accessの保護対象は、0011の方式を引き継ぎます。

PRコードのbuildとWorker bundle生成はSecretのないCIで実行します。公開runnerは固定した構成、検査済みbundle、PRのSQL migrationだけを使い、PRのプログラム・実行命令・設定を実行しません。通常URLは最新の公開版へ更新され、固定URLは特定の公開版を開きます。通常URLと固定URLの両方で、APIの版がPRの版と一致し、接続確認が成功した場合だけ「疎通確認済み」と表示します。

## 代償と移行

PRごとのD1作成・migration・削除が必要になります。PR終了時はそのPreviewとPR専用D1を削除し、RoomDOの保存先もCloudflareのPreview終了に伴って削除されます。保存したデータが翌日も残ることは保証しません。PR終了後は、保存したデータを保持しません。再公開は同じPRの保存先を再利用しますが、固定URLも保存データやmigration前の状態まで固定するものではありません。

旧共通API・D1・RoomDOは既存の検証用ルームのために保持します。新方式へ移った通常URLでは、ステップ選択から新しいルームを作ります。Appだけを含む旧形式のartifactは公開前に拒否し、共通APIへのfallbackを行いません。公開基盤をマージした後、対象PRに最新developを取り込み、新しいCI artifactを作ってから公開します。

手元のパソコンでのテストが成功しても、Cloudflareへの公開や実際のGoogleアカウントでのログインを確認したことにはなりません。Cloudflare Previewで動かない定期実行などの機能は、別途実行環境で確認します。

根拠: [CloudflareのPreview保存先・分離・Service Bindingの制約](https://developers.cloudflare.com/workers/previews/resources/)。

## 実公開での確認

利用者の承認に従ってPR #591をdevelopへマージし、PR #587へ取り込みました。PR #587のApp/APIはb75edf4dで公開され、通常URLと固定URLの接続確認が成功しました。本人のGoogleアカウントで前進・戻る・再読み込み後の保存を確認しました。別のGoogleアカウントとの共同操作、別PRが互いに影響しないこと、保存先を削除して作り直す際の動作は未確認です。[画像付き確認記録](https://github.com/engineer-first/idea-boost/pull/587#issuecomment-6107148027)、[公開処理](https://github.com/engineer-first/idea-boost/actions/runs/38124268809)を参照してください。

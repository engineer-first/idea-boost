# docs/site — GitHub Pages 公開ディレクトリ

このディレクトリ配下がそのまま [https://engineer-first.github.io/idea-boost/](https://engineer-first.github.io/idea-boost/) として公開される。
主な読者・書き手は AI エージェント。ここへページを追加・変更する前にこのファイルを読むこと。

## デプロイの仕組み

- `.github/workflows/deploy-pages.yml` が `develop` への push で発火する（`docs/site/**` またはワークフローファイル自身に変更があったとき）。
- ビルド工程はない。このディレクトリがそのまま Pages artifact としてアップロードされる。
- feature ブランチ上では公開されない。ローカルでは HTML ファイルを直接ブラウザで開いて確認する。
- PR で `docs/site/**` の HTML を追加・変更すると、`.github/workflows/docs-site-preview.yml` が githack 経由のプレビュー URL を PR に自動コメントする（デプロイは発生しない）。レビュー時はそのリンクから表示を確認できる。
- デプロイ状況の確認: `gh run list --workflow=deploy-pages.yml`
- この README.md も公開対象に含まれ、URL 直打ちで取得できる。公開されて問題ない内容だけを書く（サイト内に導線は置かない）。

## ページ追加の手順

1. slug を kebab-case で決める（例: `realtime-explainer`）。
2. `docs/site/<slug>/index.html` として作成する。1 ページ = 1 ディレクトリ。
  - 理由: URL が `/<slug>/` と綺麗になり、画像などの付属アセットを同じディレクトリに同居させられる。ページが育って分割しても URL が壊れない。
3. ルートの `index.html`（目次）に新ページへのリンクを追加する。

## lint の扱い

- このディレクトリは Biome の検査対象外（`biome.json` の `files.includes` で除外）。
- 理由: ここに置くのは Claude の Artifact をコピーした自己完結の静的ドキュメントで、
  アプリケーションコードの lint ルールに合わせる価値が薄く、コピーのたびに手直しが
  発生して Artifact 側とソースが乖離するため。
- 品質はこの README の「ページの品質要件」で担保する。

## ページの品質要件

- **完全に自己完結させる**: CSS/JS はすべてインライン。CDN・外部フォント・外部画像・fetch/XHR を使わない。
  - 理由: 外部依存が腐らない、オフラインでも開ける、Claude の Artifact（外部リクエスト禁止の CSP 下で動く）とソースを相互に流用できる。
- 画像が必要な場合はページと同じディレクトリに置き、相対パスで参照する。可能なら SVG インラインを優先する。
- 必須の head 要素: `<html lang="ja">`・`<meta charset="utf-8">`・viewport・`<meta name="color-scheme">`・`<title>`・`<meta name="description">`。
- ライト/ダーク両テーマに対応する: `@media (prefers-color-scheme: dark)` を基本にし、`:root[data-theme="light"]` / `:root[data-theme="dark"]` で上書きできるようにする。実装例は既存ページを参照。
- ページ全体に横スクロールを発生させない。幅の広い表・図・コードブロックは `overflow-x: auto` のコンテナ内でスクロールさせる。

## 変更・削除のルール

- 公開済みページの URL（= ディレクトリ名）は変えない。外部にリンクが共有されている前提で扱う。
- ページの削除・改名は URL を壊す操作なので、ユーザーの明示的な指示があるときだけ行う。
- 既存ページの内容更新は自由。ただし slug と `<title>` の同一性は保つ（別テーマになるなら新ページとして追加する）。

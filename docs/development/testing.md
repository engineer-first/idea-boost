# テスト方針

検知したい不具合を先に定め、その不具合を観測できる最小の層で検証する。
テスト件数や query API の種類だけで、追加・維持・削除を判断しない。
振る舞いを変えるときの red → 実装 → green の順序は
[AGENTS.md の開発と検証](../../AGENTS.md#開発と検証) に従う。

## 検証する層を選ぶ

| 検知したい不具合                                                   | 主な検証先                                   | 残すべき境界                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| 入力検証、集計、状態遷移、表示条件の判定が誤る                     | Vitest の純関数・reducer・hook               | 条件の分岐と結果。UI への接続は別途確認する                                        |
| クリックが届かない、callback の引数が違う、送信中も操作できる      | Vitest + Testing Library の DOM テスト       | 実際の操作から callback・送信・遷移までの接続、無効化やエラー時の結果              |
| 受け取ったデータが表示されない、別人の値や古い値が出る             | DOM テスト                                   | 入力データと表示結果の対応。招待コード・投稿本文・集計値等は文言で照合してよい     |
| 権限や状態に応じた説明・操作の表示が切り替わらない                 | DOM テストと、条件を持つ純関数・hook         | 表示する場合と隠す場合、状態変更後の表示。説明文の全文一致は必須ではない           |
| 不正な操作を受理する、非公開データを配信する                       | Worker / RoomDO テスト                       | 認証認可・可視性・永続化・配信。ボタンを隠す DOM テストでは認可を保証できない      |
| 色・余白・文章の折り返しなどの見た目が変わる                       | stories と公開 Storybook の表示レビュー      | 対象状態を story で再現し、変更後の表示を確認する                                  |
| 重なって押せない、画面外へ出る、スクロールやフォーカス移動が壊れる | Vitest から Playwright を使う browser テスト | 実ブラウザの寸法・到達性・キーボード操作。CSS クラスの一致だけでは保証できない     |
| 説明の意味や手順が伝わらない                                       | 文面と実画面を人がレビュー                   | 意味の正確さ・読みやすさ・実際の操作との対応。スナップショットだけでは判断できない |

純関数のテストが通っても、その結果が DOM に渡るとは限らない。
一方、同じ不具合を親の DOM テストで検知できるなら、子ごとの専用 spec は必須ではない。
境界をモックしているテストは、モックより先の保証として数えない。

## UI 変更の判断

- 文言・CSS・配置だけを変える場合は、story と表示レビューを基本にし、固定文言や
  クラスの存在だけを写す専用 DOM テストを原則増やさない。文言配列の全文一致にも同じ基準を使う。
  クリックの到達性、表示条件、データの対応、フォーカス等を変える場合は振る舞いの変更として扱う。
- `getByText` や `toHaveClass` を一律に禁止・削除しない。どの不具合を検知するかで判断する。
  操作対象には role と accessible name 等を使い、表示データにはテキスト照合を使える。
  投票対象・基準や誤操作防止の説明など、内容自体が PRD の要件なら必要部分の一致と表示条件を残す。
  全文を固定する場合は要件や過去の不具合を根拠として示す。
  クラスが操作可否等の仕組みに関わる場合も、可能なら結果の振る舞いを検証する。
- すべての UI コンポーネントの stories は [UI 規約](conventions.md#ui) に従って作る。
  story の存在や Storybook 公開の成功だけで、操作・認可・説明の分かりやすさを保証したとしない。
  振る舞いを保証するには、操作と結果を検査するテストを実際に実行する。
- データに依存する UI は、適用される loading / empty / success / error の振る舞いを検証する。
  例として、送信中の二重操作防止、空状態の案内と操作、取得データの表示、失敗時の通知や再試行を扱う。
  状態を持つ container・view 等でカバーし、子部品ごとの専用 spec や存在しない 4 状態は要求しない。
  各状態の見た目も stories で再現する。

## 既存テストを整理するとき

削除・統合する assertion が守っていた不具合を挙げ、残る検証先と対応づける。
同じ保証がないなら振る舞いの検証を残すか補う。表示データ・表示条件・DOM の接続まで
「表示のテスト」とまとめて削除しない。静的な文言や装飾だけの重複は、対応する story と
レビュー方法を確認して整理する。件数削減やカバレッジ数値を目的にしない。

## 実行経路

コマンドの正本は [package.json](../../package.json)。変更範囲に必要な検証を実行する。

- unit / DOM: `npm run test`（[vitest.config.mts](../../vitest.config.mts)、jsdom）
- Worker / RoomDO: `npm run test:workers`（[vitest.workers.config.mts](../../vitest.workers.config.mts)、`@cloudflare/vitest-pool-workers`）
- browser: Storybook を起動または build して配信し、`npm run test:browser`
  （[vitest.browser.config.mts](../../vitest.browser.config.mts)、`tests/browser/`）。
  配信先は `STORYBOOK_TEST_URL`、既定は `http://127.0.0.1:6006`。

[CI](../../.github/workflows/ci.yml) は unit・Worker・browser 等を実行する。

## 公開 Storybook で表示を確認する

[Chromatic の workflow](../../.github/workflows/chromatic.yml) は push ごとに Storybook を公開する。
依存更新 bot（`renovate/**`・`dependabot/**`）のブランチは従来どおり公開をスキップする。
PR のチェック欄の **Storybook Publish** から対象コミットの版を開き、
loading / empty / success / error などの状態を確認する。
`Schema/*` と `Dependencies/*` の生成図も同じ版に含まれる。
実アプリの動作確認には [PR Preview](../operations/preview.md) を使う。

Chromatic のプロジェクト設定は **UI Tests と UI Review の両方を OFF** にする。
[公式のよくある質問](https://www.chromatic.com/docs/faq/disable-ui-tests-and-or-review/)のとおり、
片方でも ON なら撮影が続き、両方 OFF なら撮影・画像比較を止めて公開を続けられる。
撮影対象の追跡、差分の Accept / Deny、ベースラインの自動承認は行わない。
公開全体を止める `skip: true` は指定しない。

workflow と Storybook Publish の成功は公開完了を示し、画面比較の合格を示さない。
ビルド・アップロードの失敗は公開失敗として workflow のログから調べる。
過去コミットの UI Tests が pending のまま残る場合は、そのコミットの検査状況として扱い、
新コミットの公開結果・撮影実績とは区別する。新コミットでも撮影や UI Tests / UI Review の
保留が発生したら、両設定が OFF になっているかを確認し、対象コミットのビルドも調べる。
Vitest・Worker・browser の操作・レイアウト検査は [CI](../../.github/workflows/ci.yml) で継続する。
図解と確認例は [公開 Storybook の運用ガイド](../site/vrt-operations/index.html) を参照する。

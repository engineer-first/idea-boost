# LPの画面画像を再生成する

LPのボード画像を更新する担当者向けの手順。ボードUI・撮影データ・画像寸法を変更したときに、画像とこの手順を更新する。

## 撮影元と掲載範囲

- Storybook: `Room/RoomBoardView` の `LandingPreview`。
- 架空データ: `features/room/templates/landing-board.fixture.ts`。睡眠・時間の使い方を題材にした説明用の画面で、実際の利用記録ではない。
- 配信先: `public/landing/board.webp`（800×550、WebP品質85）。
- LPの実際の成果例は `features/landing/logic/landing-outcomes.ts`。掲載許可済みの本文を原文のまま保持し、チーム名・イベント名・日付は掲載しない。画像の架空データとは分ける。

## 再生成

依存関係とPlaywrightのChromiumが導入済みの環境で、リポジトリのルートから実行する。

```sh
npm run storybook
```

別のターミナルで次を実行する。

```sh
node scripts/capture-landing.mts
```

別ポートで起動した場合はURLを明示する。

```sh
STORYBOOK_TEST_URL=http://127.0.0.1:6016 node scripts/capture-landing.mts
```

スクリプトはサーバーを起動しない。撮影完了後、起動したStorybookをCtrl+Cで停止する。Storybook標準起動には自動停止期限がない。管理・停止の方針は[開発サーバーの起動と停止](dev-server-lifecycle.md)を参照。

1440×1000の画面から、左620・上140を起点に800×550の範囲を撮影する。付箋3枚の文字サイズは24pxとし、画面全体よりも本文と投票シールの可読性を優先する。1280px幅のLPでは約510×351px、390px幅では約342×235pxで表示する。軸・進行表示はこの切り抜きには含めない。

撮影は明色・日本語・Asia/Tokyo・DPR 1・固定時刻で行い、フォントと描画を待つ。タイマーは固定時刻に合わせた稼働状態とし、一時停止の案内を画像へ写し込まない。ブラウザとフォント環境が異なる場合は画素単位の同一性を保証しない。

## 配信と確認

現行の `wrangler.jsonc` にCloudflare Imagesの `IMAGES` bindingはない。導入済みOpenNextの画像処理も、このbindingがない場合は最適化せず原画像を返すため、LPでは事前圧縮したWebPを `next/image` の `unoptimized` で配信する。幅と高さを指定し、ヒーロー画像はeager読み込みとする。アプリのボードコードやfixtureをLPへ読み込まない。

再生成後は画像そのものと `Landing/LandingView` のPC・狭幅表示を確認する。付箋本文と本人の投票シールが読み取れること、実画面と架空入力の注記が一致すること、画像の取得失敗と横溢れがないことを確認する。ネットワーク条件を記録しない撮影結果を速度の測定値として扱わない。

```sh
npm run test:browser -- tests/browser/landing.spec.ts
```

初版では動画を配信しない。静止画と短文だけで価値と使い始め方を伝える。

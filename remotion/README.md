# Idea Boost Remotion operation demo

口頭説明と同時に流す、2分14秒・60fpsの操作確認動画です。ホームとロビーは本体のView部品、
ボードは`RoomBoardView`を直接利用し、実際のデザインと文言を共有します。

## Preview

```bash
npm run remotion:studio
```

## Render

```bash
npm run render:idea-flow
```

出力先は`remotion/out/idea-flow-operation-demo.mp4`です。
プレゼン用には同じ動画を `docs/site/presentation/demo2.mp4` に配置します。

UIは `origin/develop`（`6bbe03e`）と照合した本体Viewを利用します。
動画用の決定的描画ではマイ付箋を開き、現行の「考えるヒント」を表示します。
ホーム6秒・ロビー7秒・完了11秒は維持し、全14ステップを旧動画より各1秒延長しています。

| フェーズ                | 開始  | 尺   |
| ----------------------- | ----- | ---- |
| ルーム準備              | 00:00 | 13秒 |
| 課題整理（5ステップ）   | 00:13 | 40秒 |
| 問いの作成（4ステップ） | 00:53 | 29秒 |
| アイデア（5ステップ）   | 01:22 | 41秒 |
| 完了                    | 02:03 | 11秒 |

全17場面のレビュー静止画は次のコマンドで生成できます。

```bash
REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node remotion/scripts/render-operation-review.mjs
```

## Idea Boost Launch Video

42秒のローンチ動画は `IdeaBoostLaunch` として登録されています。Remotionのフレーム時刻から
Motionのばねを決定的にサンプリングし、実UIのView部品を動画用のダークテーマで再利用します。

```bash
# オリジナルBGM（48 kHz stereo WAV）を再生成
npm run audio:idea-boost-launch

# 1920×1080 / 60fps / 42秒の本番MP4を書き出し
npm run render:idea-boost-launch

# 最終フレームの静止画を確認
npm run still:idea-boost-launch
```

MP4は `remotion/out/idea-boost-launch.mp4`、音源は
`public/launch/idea-boost-score.wav` に出力されます。全場面のレビュー静止画は、必要に応じて
`REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node remotion/scripts/render-launch-review.mjs` で再生成できます。

動画内のUIデータは通信やDurable Objectに接続せず、`remotion/src/launch/launch-state.ts` の
フレーム状態から決定的に生成します。投票中は本人の票だけを表示し、開票後に集計を表示します。

## Structure

- `src/idea-flow-operation-demo.tsx` — 本体UIを使った画面構成
- `src/timeline.ts` — 134秒・60fps・全14 Stepのタイムライン
- `src/components/` — カーソル、波紋、カメラワーク
- `src/data/operation-demo-state.ts` — フレームから本体UI propsへの変換

WebSocketやDurable Objectには接続せず、本体のViewへ決定的な動画専用データを
渡すことで、毎回同じ結果をレンダリングします。動画は無音です。
共有作業中は本体の名前付きリモートカーソルを使い、4人が同時参加している
状態を再現します。付箋を動かすシーンでは、カーソルと付箋を同じ座標計算で
同期させます。

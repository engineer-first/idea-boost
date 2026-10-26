# LPの画面イメージを更新する

LPは実画面のスクリーンショットではなく、説明用のHTML/CSSモックを表示する。

- ボード: `features/landing/molecules/landing-board-mock.tsx`。hero / issue / private / vote のstoriesで確認する。
- 説明用の架空入力: `features/landing/logic/landing-board-copy.ts`。実際の掲載許可済み成果は `landing-outcomes.ts` に保持し、混同しない。
- 動くヒーロー: `landing-demo.tsx`。CSS keyframesを8秒で繰り返し、最後にフェードして初期状態へ戻す。reduced-motionでは完成状態で静止する。
- 色・配置・動き: `landing.module.css`。投票シールは実アプリと同じ赤系ハート・青系の天秤を参考に簡略化する。

画面イメージは操作できず、装飾は読み上げ対象外。
確認はLandingの各storyと実アプリのPC・狭幅で行う。画像生成・外部画像配信は不要。

```sh
npm run test:browser -- tests/browser/landing.spec.ts
```

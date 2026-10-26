# LPの画面イメージを更新する

LPは実画面のスクリーンショットではなく、説明用のHTML/CSSモックを表示する。

- ボード: `features/landing/molecules/landing-board-mock.tsx`。hero / issue / private / vote のstoriesで確認する。
- 説明用の架空入力: `features/landing/logic/landing-board-copy.ts`。実際の掲載許可済み成果は `landing-outcomes.ts` に保持し、混同しない。
- 動くヒーロー: `landing-demo.tsx`。CSS keyframesを8秒で繰り返し、最後にフェードして初期状態へ戻す。reduced-motionでは完成状態で静止する。
- 色・配置・動き: `landing.module.css`。投票シールは実アプリと同じ赤系ハート・青系の天秤を参考に簡略化する。

画面イメージは操作できず、装飾は読み上げ対象外。
確認はLandingの各storyと実アプリのPC・狭幅で行う。ボードの更新に画像生成は不要。装飾画像は下記を参照。

```sh
npm run test:browser -- tests/browser/landing.spec.ts
```

## mood-1の装飾イラスト

ボードは引き続きHTML/CSS。周囲のキャラクターのみ組み込み画像生成ツールで生成し、
`public/landing/mood-{a,b,c,d,e}.webp` に保存する。画像に文字は入れず、付箋の文言は
`landing-board-copy.ts` の `landingMoodCharacters` からHTMLで重ねる。
全キャラクターは装飾（alt空・aria-hidden）、現在は常時静止。

再生成時の共通プロンプト:

> Flat playful paper-cut geometric mascot, slight subtle paper grain inside solid colors,
> bold simple silhouette, dark navy dot eyes and tiny happy mouth, no outlines, no 3D,
> no shadow/background, genuinely transparent background, no text, no letters, no watermark.
> Primary cobalt-blue, orange-red, sunshine-yellow, lilac illustration family.
> Center entire figure with safe margins.

| 素材            | 共通プロンプトに追加する指定                                                                               | 採否                   |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------- |
| A / mood-a.webp | Cobalt blue rounded humanoid holding a blank pale blue sticky note in both hands, face above note.         | 採用                   |
| B / mood-b.webp | Orange-red five-point star character holding a blank pale pink sticky note, face above note.               | 採用                   |
| C / mood-c.webp | Sunshine-yellow rounded humanoid holding a blank pale green sticky note, face above note.                  | 採用                   |
| D / mood-d.webp | Lilac rounded humanoid looking left, one arm waving, no note or props.                                     | 採用                   |
| E / mood-e.webp | Landscape composition, three blue/orange-red/lilac characters raising their arms in celebration, no notes. | 透過縁の再編集版を採用 |

A〜Cは正面向きの空の付箋を、画像中央x50%・y64%付近、幅50%・高さ32%程度と指定。
生成結果に合わせてHTMLの重ね位置を確認する。Eは外周の色にじみを確認するため、
「Remove all colored glow, halo, haze and shadows outside the figures; preserve characters,
poses and paper grain; fully transparent surroundings」を追加して編集し、黄色地で検査した。
原本PNGのalphaを維持し、SharpでA〜Dを400px、Eを800px幅へ縮小、WebP quality78・
alphaQuality95で保存。5枚合計94,258 bytes。背景除去の後処理は不要だった。

青・赤橙・黄・紫はCSSの `--lp-brand-*` に集約。既存 `--lp-accent` はCTA・操作表現に
維持し、brand色は帯・幾何学片・下線へ使う。画像色を変更する場合は再生成も必要。

### 比較バッジ C 案の Before 素材（F・G）

画像生成で文字を含まない透過素材を作成し、Sharp の trim → 幅180px → WebP（quality 78 / alphaQuality 95）で保存した。

- F: `public/landing/mood-f.webp`（180×89、4,210 bytes）。3枚綴りのカレンダー。
- G: `public/landing/mood-g.webp`（180×173、8,286 bytes）。指し棒とホワイトボードを持つ進行役。

F のプロンプト:

> A small connected desktop calendar with exactly three blank pages side by side, chunky rounded paper shapes, muted slate blue binding, ivory paper, subtle paper grain, a tiny tired friendly face of two dark navy dot eyes and a little mouth on center page. No dates, numbers, letters, marks or text. Flat playful paper-cut illustration, minimal bold shapes, centered entire object, transparent background, no shadows or glow. Square canvas. Same family as playful geometric mascot landing-page illustrations.

G のプロンプト:

> A small muted slate-blue rounded geometric humanoid facilitator with dark navy dot eyes and tiny smiling mouth, standing next to a blank ivory whiteboard on an easel and pointing to it with a simple pointer stick. Flat playful paper-cut illustration, subtle paper grain, bold simple shapes, no outlines, no 3D, no shadows or glow. No text, letters or numbers anywhere. Center entire character and board in square canvas, genuinely transparent background. Same family as playful geometric mascot landing-page illustrations.

After 側は既存のタイマー・現在地カードのコード表現を維持。Before は48px枠に収め、彩度を抑えて After の文言を強調する。

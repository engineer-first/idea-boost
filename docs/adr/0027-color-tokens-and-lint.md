---
id: "0027"
status: Proposed
date: "2026-11-08"
---

# ADR 0027: 色と角丸はDESIGN.mdの名前で書き、直書きはBiome公式ルールで止める

## Context

DESIGN.mdに色と角丸の値を定めた後も、Tailwindの既定パレット（`bg-blue-500` など）や `#RRGGBB` の直書きが23ファイルに残っていた。機能ごとに色の判断が分かれ、DESIGN.mdの値を変えても取り残される部品が出る状態だった。検査を有効にした時点の検出は204件だった。

一方で、作者色の定義元、オンボーディングのイラスト、LPの配色、テストやstoriesの見本の色など、値を直接持つ正当な場所もある。一律に禁止すると開発の手間が増える。

検査に使える `nursery/noTailwindRawColors` は試験段階のBiomeルールで、角括弧が二重になるクラスを読めずに終了コード1を返す不具合がある。また、このルールが見るのは `class` / `className` 属性と `cn()` などの引数だけで、定数の文字列に書いたクラスは対象外になる。

## Decision

色と角丸の値の正本をDESIGN.mdのYAMLとし、画面ではその名前で書く。Tailwindでは `bg-primary` のような名前、CSSでは `var(--ib-color-*)` を使う。淡い面や透明度は名前から作り、色の混合は `oklab` で行う。`oklch` では色相が途中の値に回り、意図しない色になるためである。

直書きの検出には、Biome公式の `style/noHexColors` と `nursery/noTailwindRawColors` だけをerrorで使う。ルールは自作しない。公式ルールが届かない書き方は、レビューで確認する。対象は、tsx内のhex（SVGの `fill`、inline style）、任意値（`bg-[#…]`）、定数の文字列に書いたクラスである。

例外は、その場所に理由付きの `biome-ignore` を書くことを基本にする。ファイル全体が例外のときだけ `biome.json` の `overrides` に入れ、対象をDESIGN.mdに書く。

### 本ADRで決定しないこと

トークンの名前・値・役割の説明は[DESIGN.md](../../DESIGN.md)へ委譲する。例外ファイルの一覧は[biome.json](../../biome.json)とDESIGN.mdの「値を直接書かない」へ委譲する。道具の影の値は[app/globals.css](../../app/globals.css)へ委譲する。トークンの生成と検査のコマンドは[package.json](../../package.json)へ委譲する。

## Consequences

- 良い影響：DESIGN.mdの値を変えると、生成したCSSを通じて画面に反映される。新しい直書きはCIで止まる。
- 良い影響：例外の場所に理由が残るので、後から正当性を見直せる。
- 悪い影響：試験段階のルールに依存する。不具合のため `room-board-canvas.tsx` と `room-board-header.tsx` ではパレットの検査を止めており、この2ファイルはレビューに頼る。ルールの仕様や名前が変われば設定を追従させる必要がある。
- 悪い影響（受け入れるリスク）：定数の文字列、tsx内のhex、任意値は検査で保証しない。定数の文字列は、ドット投票のシールの色で実際に死角になった。
- 中立：DESIGN.mdにない色が要るときは、先に役割の名前を足す手順が増える。
- 根拠未確認：ルールを自作しない理由は、方針を決めた記録に書かれていない。
- 見直す条件：
  - `noTailwindRawColors` が安定版になったとき、または定数の文字列も検査できる設定ができたとき。
  - レビューの死角から直書きが繰り返し入るとき。

## Alternatives Considered

- 既存のast-grepルールで表す案：方針を決める前の候補に挙がっていたが、不採用の理由は記録されていない（根拠未確認）。後に、定数文字列の既定パレットを検出するast-grepルールを試作し、旧コードの違反を検出できることを確認した。しかし本方針に合わせて採用せず、レビューで確認する扱いに戻した。
- 検査の強さをinfoから始める案：当初はこの予定だった。役割のない色の置き換えまで終えて検出が0件になったため、最初からerrorにした。

## References

- [色・角丸の直書きをlintで扱う方針を決める #877](https://github.com/engineer-first/idea-boost/issues/877)：2026-11-08に方針を記したコメント（使う検査・例外の扱い・CIでの強さ）。`date` はこのコメントの日付。投稿者名だけを本人の採用の根拠とはしていない。
- [実装 PR #948](https://github.com/engineer-first/idea-boost/pull/948)：2026-11-10にマージ。errorへの引き上げ、`oklab` の採用、2ファイルの除外が記録されている。
- [ドット投票のシールの色 #952](https://github.com/engineer-first/idea-boost/issues/952)、[PR #960](https://github.com/engineer-first/idea-boost/pull/960)：定数文字列の死角と、ast-grepルールの試作と取り下げ。
- [biomejs/biome#11342](https://github.com/biomejs/biome/issues/11342)：二重の角括弧を読めない不具合。
- Biome `noTailwindRawColors` の説明：検査対象は `class` / `className` 属性と `clsx`・`cn`・`cva` などの引数。Biome 2.5.15 の `biome explain` で2026-11-11に確認した。
- 2026-11-11 Claudeセッション fdb4a24f-2d6f-498b-9658-315f130b408a：定数文字列の死角をast-grepで補わず、レビューに戻すことを本人が選んだ。承認の範囲はこの点だけである。ADR全体の採用承認はまだないため、Proposedとする。
- 2026-11-11に、develop `3d0dc318` の `biome.json`・DESIGN.md・`app/globals.css` と照合した。

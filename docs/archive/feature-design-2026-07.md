# feature構成の比較・検証記録（2026年7月）

> 過去資料：2026年7月の分析、候補比較、検証、改定を1文書に統合したもの。現行規約は[開発規約](../development/conventions.md)、採用判断は[ADR 0002](../adr/0002-feature-boundaries.md)・[ADR 0003](../adr/0003-feature-bands.md)。ファイル数・行数・検証結果は当時の記録で、現在の実測ではない。

## 別々に判断した2つの問い

| 問い                         | 候補                                                | 当時の採用                                |
| ---------------------------- | --------------------------------------------------- | ----------------------------------------- |
| リポジトリ全体を何で分けるか | 全体のAtomicツリー / 機能ごとのfeature              | 機能単位のfeatureと公開境界（PR #128）    |
| feature内部をどう分けるか    | フラット / 部品ごとの箱 / Atomic分類 / 依存方向の帯 | 5帯。2026-07-13決定、2026-07-14移行・改定 |

全体の分割軸と内部の配置を同じ「Atomicを使うか」という問いにすると、採用理由を取り違える。後者の変更は、前者のfeature分割を撤回するものではない。

## 全体Atomicツリーで観測した問題

PR #128以前は、`components/room-board`等のmolecules / organisms / templates、`app/rooms`内のreducer、container / view分離が併存していた。

- atomsは存在せず、実物は2〜3段にしか埋まらなかった。空の箱は一覧の助けにならなかった。
- moleculeの`note-card.tsx`が`@/app`の型をimportしていた。同種の逆流5本はPR #128の境界検査で検出・解消された。粒度の分類だけでは依存方向を制約できなかった。
- 色の定数・純ロジックである`note-color.ts`もmoleculesに置かれていた。UIの粒度分類にはhook・reducer・Server Action・定数の置き場がなかった。
- 機能の変更が複数の粒度ディレクトリに散らばった。配置の見栄えと変更理由が一致しなかった。

このため機能をfeatureへ集め、汎用UI・インフラ・通信の形を別の境界へ分けた。粒度の確認にはStorybook、依存の確認には実測の`Dependencies/*`を使う方針とした。

## feature内部で解決したかったこと

当時のroomは52ファイルまで増え、部品の大きさと「誰が誰を使うか」を一覧で把握しにくくなった。UI実装7件にspec / stories / fixtureを含めると19件となる約2.7倍の衛星ファイルがあり、単に分類を変えてもファイル総数は減らなかった。

部品の粒度、衛星ファイルの見通し、依存方向は別の課題として比較した。

## 候補の比較

| 案                                   | 効果                                                                   | 費用・残る問題                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A: フラットなui / logicとfileNesting | 移行不要。VS Codeでは衛星を畳める                                      | GitHub・他エディタでは効かない。UI一覧の見通しはIDEに依存する                        |
| B: 部品ごとのディレクトリ            | IDEを問わず実装と衛星をまとめられる。箱名とステムを照合できる          | クリックが1段増え、小さなdialogにも箱が必要。深さ3に対応する境界規則と箱の検査が必要 |
| C: 本質的なAtomic分類とlogic         | Atomic経験者には粒度を読みやすい                                       | molecule / organismの分類に機械判定器がない。containerの置き場と衛星問題が残る       |
| C′: 依存方向の5帯                    | 作者が宣言した依存方向を検査できる。既存の階層を概ねそのまま配置できる | 衛星は畳まれず、昇格にimport変更が伴う。部品の大きさそのものは保証しない             |

初期の比較ではC′とfileNestingの併用を前提にしていたが、最終判断ではfileNestingを取り除き、GitHubで衛星が畳まれないことを受容した。この前提変更を、採用後も「nesting必須」として持ち越さない。

### BとCをroomへ当てた検証

- Cでは同じ部品をmolecule / organismのどちらにも分類でき、分類の正解をCIで検査できなかった。containerにも専用の語彙がなかった。
- `room-board-view`にはmoleculesやshadcnへの直接importがあり、「箱の階段を必ず順に通る」という説明は実測と一致しなかった。
- Bでは衛星をまとめられる一方、`ui/部品/`から`../../logic/`を参照するため、深さ2を前提にした境界規則の変更が必要だった。containerとviewを同じ箱へ置くかも別途決める必要があった。
- どの案でも、613行の`room-board-view.tsx`の責務分割は別の作業だった。箱を増やすこと自体を実装の分割と扱わない。

## C′で判定対象を変えた

「本当にmoleculeか」を判定する代わりに、配置を依存の上限の宣言として扱った。UIの4帯にlogicを加え、上向きimportを禁止し、帯のスキップと同帯依存を許可する。

これによりtemplatesからmoleculesへ直接importしても矛盾しない。containerの箱を明示し、hook・純関数・定数はlogicへ分けた。新規UIを最下帯へ置き、上の部品が必要になった場合に昇格する方式とした。

当時のroomはspec / stories / fixtureを含めてこの帯規則に違反なく配置できた。notes、vote-totaling、dot-voteにも既存の2〜3段の依存があった。ただし、帯は依存の方向を制約するもので、実測の段数や部品の大きさを写すものではない。

## 境界検査で実証した穴

禁止先だけを書くブラックリストでは次の経路が漏れ、許可する相対importの形を限定する方式と専用規則へ変更した。

| 経路                                                              | 当時の検証結果・対応                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `../index`経由の再export                                          | moleculesから公開境界経由でcontainersへ到達できた。許可プレフィックスを限定した  |
| `.././containers/`・`..//containers/`・スラッシュのないbarrel指定 | TypeScriptでは解決されるが素案のregexを回避した。非正規化・barrel経路も検査した  |
| 動的import                                                        | import文だけを見る検査では漏れた。静的に読めない引数を禁止する専用規則を追加した |
| `ui/`と5帯の混在                                                  | 移行中の共存を止められなかった。配置検査を移行より先に追加した                   |
| require / import-equals                                           | CommonJS経路を専用規則で禁止した                                                 |
| 連続スラッシュのalias・エスケープ・JS系拡張子                     | 解決結果と検査対象のずれを専用規則で防いだ                                       |
| 未登録featureからのfeature import                                 | 登録外のfeatureではfeature importを既定で拒否した                                |

aliasによるdeep importと自featureの公開境界へのimportは、既存検査で捕捉できた。.storybookやscriptsからのdeep importは当時の帯検査の対象外であり、現在の検査能力までこの記録で保証しない。

当時は`.storybook`・Vitest・Biome・CIに旧ui / logicのパス前提がなく、明示的なstoryタイトルを維持することで箱の移動によるStorybookの名前変更を避けられた。

### 2026-07-14の緩和

- 動的importは、文字列リテラル1つの引数を許可した。静的解析できない変数・式・テンプレートリテラルは引き続き禁止した。リテラルの帯・feature境界はコードレビューへ委ねた。
- `declare module`の一律禁止を撤廃した。型レベルの結合と、実行時の境界を越える依存を区別し、モジュール拡張はレビューへ委ねた。

強制する検査の現行形は[ast-grep](../../rules/ast-grep/)・[帯検査の回帰テスト](../../scripts/band-import-rules.spec.ts)・[配置検査](../../scripts/check-feature-layout.mts)で確認する。

## 受容した費用と見直す条件

- 衛星ファイルの総数とGitHubの一覧のノイズは残る。昇格が連鎖するとimport変更も増える。
- 他featureの公開APIにはfeature間の依存規則を適用する。自featureの帯名から、他featureの部品の大きさまでは保証しない。
- 当時の再検討条件は、昇格が月5回を超える状態が2か月続くこと、衛星の見落としによる差し戻しが複数回起きることだった。
- 1帯の実装が15を超える場合は、まずfeatureの切り出し漏れを疑うこととした。view分割は単独でStorybookへ載せたい責務、feature分割は実測依存のまとまりから判断した。

これらは当時の判断条件であり、現在その条件を満たしているという主張ではない。

## 当時の先行事例調査と原資料

層の所属を作者の宣言とし、依存方向を検査する先行例としてeslint-plugin-atomic-design、eslint-plugin-boundaries、dependency-cruiserを比較した。前者の当時の更新状況から、既存のast-grepで実装する方針とした。FSDのAtomic比較とBrad Frostの文献も参照した。

これは2026年7月の調査の要約で、現在のライブラリの保守状況の評価ではない。各出典・詳細な試行・旧コード例は次の固定コミットの原資料から辿れる。

- [全体構造の原分析](https://github.com/engineer-first/idea-boost/blob/7a81a177b80ee761d465fce54fe66b95aadbfbeb/docs/archive/feature-structure-2026-07.md)
- [内部構造の決定・改定の原記録](https://github.com/engineer-first/idea-boost/blob/7a81a177b80ee761d465fce54fe66b95aadbfbeb/docs/archive/feature-internal-structure-2026-07.md)
- [候補比較・検証の原記録](https://github.com/engineer-first/idea-boost/blob/7a81a177b80ee761d465fce54fe66b95aadbfbeb/docs/archive/feature-ui-directory-options.md)

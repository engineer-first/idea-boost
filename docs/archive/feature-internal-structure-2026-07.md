# feature 内部の設計判断 — 5 箱「依存権の帯」（C′）

> 過去資料：2026年7月の決定と分析の全文。現行規約は[開発規約](../development/conventions.md)、判断の要点は[ADR 0003](../adr/0003-feature-bands.md)。

status: **決定・移行済み**（決定 2026-07-13、移行完了 2026-07-14）。
検討の全文（案の比較・攻撃的検証・先行事例）は
[feature-ui-directory-options.md](feature-ui-directory-options.md) が真実。
本ドキュメントは決定の要点と、当初の分析のうち今も有効な部分の記録。

「Atomic Design を採らない」という判断は、実は独立した 2 つの問いの答えである。

| 問い                              | 選択肢                                                  | 採用と文書                                                            |
| --------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. リポジトリ全体を何で縦に切るか | 粒度（Atomic ツリー）か、機能（feature）か              | feature 縦割り → [feature-structure.md](feature-structure-2026-07.md) |
| 2. feature の**中**を何で分けるか | 本質の粒度分類か、役割 2 層か、**依存権の帯（5 箱）**か | C′「依存権の帯」→ 本ドキュメント                                      |

## 決定（2026-07-13）

- feature 内は 5 箱: `containers / templates / organisms / molecules / logic`。
  上 4 箱が JSX を返すもの、`logic/` は hook・reducer・Server Action・
  純関数・定数（JSX 禁止は従来どおり ast-grep 強制）。
- **箱は「本質の分類」ではなく「依存権の宣言」**。規則は 3 つだけ:
  **上向き import 禁止・skip 合法・同帯合法**。molecules に置くことは
  「organisms / templates / containers に依存しない」という宣言であり、
  宣言の真偽（上向き import の有無）だけを機械検査する。
- 新規コンポーネントの既定は**最下帯（molecules/）**。上の帯の部品が
  必要になった瞬間に CI が落ちて昇格を教える。直感で最初から上の箱に
  置くのも合法（帯は権利であって義務ではない）。
- atoms は作らない。リポジトリ全体の atoms は `components/ui/`。
- feature 単位で「フラット or 5 箱」の二択。混在・規約外ディレクトリ・
  箱の入れ子（深さ 3 以上）・箱がある feature の root 実装ファイルは fail。
- container / view 分離・stories 必須・衛星（spec / stories / fixture）の
  実装同居は従来どおり。

### 強制する機械検査（プロンプトではなく CI）

| 不変条件                                       | 装置                                                          |
| ---------------------------------------------- | ------------------------------------------------------------- |
| 帯規則（上向き import 禁止）                   | `rules/ast-grep/feature-band-imports.yml`（ホワイトリスト型） |
| 動的 import() の非リテラル引数の死角           | `rules/ast-grep/no-dynamic-import-in-features-and-app.yml`    |
| CommonJS（require / import-equals）の死角      | `rules/ast-grep/no-commonjs-in-features-and-app.yml`          |
| 非正規化 alias（連続スラッシュ）               | `rules/ast-grep/no-double-slash-import-specifier.yml`         |
| 指定子のエスケープ（生テキストと解決値の乖離） | `rules/ast-grep/no-escape-in-import-specifier.yml`            |
| JS ファミリ（検査対象外ファイル）の混入        | `rules/ast-grep/no-js-family-in-ts-only-zones.yml`            |
| 未登録 feature の feature import（既定拒否）   | `unregistered-feature-must-not-import-features`（同 one-way） |
| 配置（フラット or 5 箱・入れ子禁止など）       | `npm run check:feature-layout`（CI）                          |
| logic/ への JSX 混入                           | `feature-logic-layer-must-not-render-jsx`                     |
| 検知能力そのものの regression                  | `scripts/band-import-rules.spec.ts`                           |

帯規則は「許可プレフィックス以外の相対 import を全禁止」のホワイトリスト型。
ブラックリスト regex では `../index` ロンダリング・`.././` 等の非正規化
パス・barrel 経由の `"../organisms"`・動的 import() が素通りすることが
攻撃的検証で実証されたため（詳細は options doc）。この初期 4 種に加え、
25 体のレッドチームによる攻撃的検証で `require()` / `import X = require()` /
連続スラッシュ alias（`@//features`）/ JS ファミリ拡張子 / `declare module` /
未登録 feature の裸の自 feature alias の 6 種の死角が実証され、上表の
専用規則で fail-closed に塞いだ。

### 改定（2026-07-14）: 動的 import() の緩和と declare module 規則の撤廃

上記のレッドチーム対応は「fail-closed」を優先し過ぎ、実害の小さい経路まで
一律禁止していた。2 点を見直した。

- **動的 import()**: 変数・式・テンプレートリテラルなど静的に読めない引数は
  引き続き禁止するが、文字列リテラル1つだけの引数（`import("./foo")`）は
  許可する。next/dynamic 等の遅延読み込みは常にリテラル引数を要求するため
  （バンドラの静的解析の前提）、この形は実務上の主要ユースケース。リテラルが
  指す先の帯・feature 境界の妥当性は機械検査の対象外になるが、ソース上に
  平文で残るためコードレビューで確認できる。三項演算子・文字列結合で
  リテラルに偽装する経路は `pattern` + `constraints` で個別に塞いでいる
  （詳細は `no-dynamic-import-in-features-and-app.yml` のコメント）。
- **declare module（モジュール拡張）**: `no-module-augmentation-in-features.yml`
  を撤廃した。このルールが塞いでいたのはコンパイル時の**型レベル**の結合
  であり、他の規則が本来防いでいる**実行時**の結合（画面変更が認証コードを
  壊す等）とは深刻度が異なる。型レベルの結合はコードレビューに委ねる。

## なぜ素朴な Atomic（本質分類）を拒否したか — 当初の分析は今も有効

1. **Atomic は logic の置き場を定義しない。** 導入しても「Atomic 階層 +
   logic/」の 2 重分類になる（実測: room は当時 UI 実装 7 に対し logic 7）。
   FSD が Atomic を採らない公式理由と同じ診断。
2. **molecule / organism の境界は、人間は直感で引けるが機械判定できない。**
   このリポジトリはルールを lint / ast-grep で強制する方針で、コードの多くを
   AI エージェントが書く。直感にしか宿らない規約は強制手段がなく黙って腐る。
   「所属の判定」を静的解析で機械化した先行事例も見つかっていない。
3. **「箱の階段 = 流れ」は import 実測と矛盾する。** room-board-view の実物は
   molecules 直 import・shadcn 生 import が混在し、階段を順に通る import は
   1 本もなかった（そしてそれは Brad Frost 的にも正しい形）。

C′ はこの急所を**判定対象のすり替え**で外した:「これは本当に molecule か」
（答えのない主観の問い）を「この import は宣言に違反していないか」（機械の
問い）に変換する。skip 合法なので実測の import とも矛盾しない。分類クイズで
答えが割れても、どちらの答えも合法——主観は「間違えると腐る分類」から
「どちらでもよい配置の好み」に格下げされた。

## 衛星ファイル倍率（×2.7）の扱い

「ui/ の見通しが悪い」の実体は衛星ファイルの倍率で、これはどんな分類でも
不変（当初の分析どおり）。採用時の判断は「**5 箱に分散すれば 1 箱あたりの
衛星ノイズは許容範囲**」。エディタの fileNesting は削除済みで、GitHub の
素のファイル一覧で衛星が畳まれないことは**受容した**（ここが案 B
\= コンポーネントごとのディレクトリ、との最終分岐だった）。

実装ファイル自体が育ったときの処方箋は箱ではなく従来どおり 2 つ:

- **view の分割**。判定器は「その部分だけ Storybook に載せたいか /
  4 状態テストを独立に書きたいか」（実例: room-board-view 613 行 →
  header / canvas / dialog ×2 / use-board-drag への分割）。
- **feature 切り出し**（room から notes を切り出した前例）。タイミングは
  Storybook の `Dependencies/*` 実測依存図で「相互にしか import されない
  クラスタ」が見えたとき。

## 再検討のトリガー（蒸し返し防止の明文化）

次のいずれかが**実際に起きたら**、そのときだけ再検討する。

- **昇格 churn の常態化**: 箱の移動（昇格）とそれに伴う import 書き換えが
  1 か月に 5 回を超える状態が 2 か月続く → 箱の数を減らす方向
  （containers + molecules + logic の 3 箱など）で再検討。
- **衛星ノイズの実害**: GitHub Web レビューで衛星に埋もれた見落としが
  原因の差し戻しが複数回起きる → 案 B（コンポーネントごとのディレクトリ）を
  再検討（options doc の実装メモが出発点）。
- **1 箱の実装ファイルが 15 を超える**（feature 切り出しでは分けられない
  まま）→ 箱の再設計ではなく、まず切り出し漏れを疑う（従来どおり）。

## 補足 Q\&A（2026-07 の議論から、今も有効なもの）

### Q. container / view 分離とは何か

`room-board.tsx`（containers/）と `room-board-view.tsx`（templates/）の
ペアが実例。view は「props でデータを受け取って描き、起きたことは callback
で報告する」だけの部品で、サーバーにも WebSocket にも触らない。container は
hook を束ねて view の props に流し込む配線係。判定器は「**Storybook に単体で
載せられるか**」。C′ で containers が第 4 の箱（Atomic 語彙の外の方言）と
して明示されたことで、「container の箱がない」問題は解消した。

### Q. logic/ は Next.js を使う限り不可避なのか

不可避だが、主語は Next.js ではなく UI 開発全般。Next.js 固有なのは
Server Action だけで、reducer・純関数・定数はただの TypeScript、hook は
React を使う限り生まれる。C′ が logic/ を 5 箱の最下帯として残すのは
このため（Atomic は UI コンポーネントの分類法で、この層に語彙を持たない）。

### Q. logic を分けずに箱だけにしたらどうなるか

過去に実例がある（`note-color.ts` が molecules/ に押し込まれていた）。
ロジックが tsx に埋まると重複と散在が始まり、テストも純関数の入出力
テストから DOM レンダリング必須のテストに劣化する（logic/ への JSX 禁止
ルールの動機そのもの）。

## 参考

- [feature-ui-directory-options.md](feature-ui-directory-options.md) —
  案 A/B/C/C′ の比較・攻撃的検証・先行事例調査の全文（決定記録）
- [feature-structure.md](feature-structure-2026-07.md) — 問い 1（feature 縦割り）の
  判断。PR #128 以前に全体 Atomic ツリーで実際に起きたことの記録を含む
- `rules/ast-grep/feature-band-imports.yml` — 帯規則の実装とコメント
- `scripts/check-feature-layout.mts` — 配置の不変条件の実装とコメント
- `scripts/dependency-graph.mts` — 切り出し判断に使う実測依存図の生成
  （subgraph は帯順で描画）

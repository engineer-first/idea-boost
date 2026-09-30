# features 構成の設計判断 — なぜ Atomic Design ではなく ui / logic の 2 層か

> 過去資料：2026年7月の検討全文。旧ui/logic構成を含む。現行規約は[開発規約](../development/conventions.md)、有効な判断の要点は[ADR 0002](../adr/0002-feature-boundaries.md)。

> **注記（2026-07-14）**: タイトルと TL;DR の「ui / logic の 2 層」は
> PR #128 時点の記録。feature 内部の構成はその後
> `containers / templates / organisms / molecules / logic` の 5 箱
> （依存権の帯）へ移行済み。現在の構成・移行理由は
> [feature-internal-structure.md](feature-internal-structure-2026-07.md) が真実。
> 本ドキュメントが答える問い 1（下記）についての結論は今も有効。

PR #128 で採用した「feature 縦割り + feature 内 ui / logic 2 層」の背景を整理する。
「Atomic Design の方がコンポーネントの流れ・データの流れが見やすいのでは」という
レビュー観点への回答を兼ねる。規約そのもの（何をどこに置くか）は
[AGENTS.md](../../AGENTS.md) が真実で、このドキュメントは「なぜそうしたか」だけを持つ。

「Atomic を採らない」には独立した 2 つの問いが含まれる。本ドキュメントが主に
扱うのは問い 1（リポジトリ**全体**を粒度で切るか機能で切るか）。問い 2
（feature の**中**を Atomic 階層にするか ui / logic にするか）は
[feature-internal-structure.md](feature-internal-structure-2026-07.md) に切り出した。

## TL;DR

（問い 2 の答えは移行前の記録。現在の構成は
[feature-internal-structure.md](feature-internal-structure-2026-07.md) 参照）

| 欲しかったもの                   | 採用した装置                                        | Atomic Design で得られるか                        |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| 部品の粒度が名前を解読せず分かる | `ui/` / `logic/` の 2 層（判定器: JSX を返すか）    | △ 得られるが境界が主観的で腐る                    |
| 実物の大きさ・見た目のカタログ   | Storybook（全 UI に stories 必須）                  | ✕ ディレクトリでは実物は見えない                  |
| データの流れ（誰が誰を使うか）   | `Dependencies/*` stories（import 実測の自動生成図） | ✕ ディレクトリ（木）では依存（DAG）は表現できない |
| 変更が 1 箇所に閉じる            | feature 縦割り + `index.ts` 公開境界                | ✕ 1 機能の変更が atoms〜templates を横断する      |
| 境界の機械検査                   | ast-grep（CI の `lint:boundaries`）                 | ✕ 「これは molecule か」を機械判定できない        |

---

## 1. 出発点: 解決したかった課題

features 移行後、`features/room` が 52 ファイルに肥大し、次の 2 つが課題になった。

1. **粒度の見通し** — `note-card` と `private-notes-toolbar` のどちらが大きい部品か、
   英語のファイル名サフィックスから毎回推論するのは認知負荷が高い。
2. **データフローの見通し** — `note-card → sticky-note → note-shadow` のような
   「誰が誰を使うか」がディレクトリからは読めない。

この 2 つは正当な欲求で、Atomic Design が魅力的に見える理由もここにある。
問題は「その欲求を Atomic Design のディレクトリが本当に満たすか」だった。

## 2. このリポジトリで Atomic Design に実際に起きていたこと

一般論の前に歴史的事実から。PR #128 以前、このリポジトリは Atomic Design の
階層ディレクトリを採用していた（`git ls-tree -r 6760c08^ components/` で確認できる）。

```
components/room-board/
  molecules/
    note-card.tsx          ← import type { Note } from "@/app/rooms/notes-reducer"
    note-color.ts          ← UI ではない（色定数 + 純ロジック）
    sticky-note.tsx
  organisms/
    private-notes-toolbar.tsx
    room-timer.tsx
  templates/
    board-view.tsx
  （atoms/ は存在しない）
components/dotvote/
  molecules/ ×2、organisms/ ×1（atoms/ も templates/ も存在しない）
```

実際に起きていたこと:

- **atoms/ が 1 個も存在しなかった。** 5 段階の語彙に対して実部品は 2〜3 段に
  しか埋まらず、分類の空マスがカタログとしての意味を持たなかった。
- **`note-card.tsx`（molecule）が `@/app` を import していた。** 粒度の規律は
  「molecule が app（最上位）に依存する」という逆流を何も止めない。同種の
  逆流 import が 5 本あり、PR #128 の ast-grep 導入時に全て検出・解消された。
- **`note-color.ts`（色定数と純ロジック）が molecules/ に置かれていた。**
  Atomic Design は UI コンポーネントの分類法なので、hooks・reducer・
  Server Action・定数の置き場を定義しない。結果、非 UI が「一番ましな箱」に
  押し込まれていた。
- **配置の流派が 3 つに割れた。** Atomic ツリー（components/）、ルート同居
  （app/rooms/ に reducer）、container-view 分離が併存し、新しいファイルを
  どこに置くかが毎回の判断になっていた。

つまり「Atomic Design にしたらどうなるか」はこのリポジトリでは仮定の話ではなく、
**戻る場所の話**である。

## 3. Atomic Design とドメイン分割の構造的な相性問題

上の観察は偶然ではなく、構造的な原因がある。

### 3.1 分類軸が「変更理由」と直交する

変更は必ず機能単位でやってくる（「投票の仕様を変える」「付箋に色を追加する」）。
一方 Atomic の置き場所は粒度単位なので、毎回の変更がディレクトリ構造と直交する。

具体例:「付箋に 👍 リアクションを付ける」という機能追加で触るファイルを比べる。

```
Atomic 構成（PR #128 以前の実構成）        feature 構成（現在）
components/room-board/                     features/notes/
  atoms/reaction-icon.tsx      ← 新規        ui/reaction-icon.tsx   ← 新規
  molecules/note-card.tsx      ← 表示追加     ui/note-card.tsx       ← 表示追加
  organisms/private-notes-toolbar.tsx        logic/notes-reducer.ts ← 状態
  templates/board-view.tsx     ← 配線
app/rooms/notes-reducer.ts     ← 状態（Atomic に置き場がなく別の場所）
```

Atomic では 1 つの機能のために 4〜5 ディレクトリを行き来し、開いた `molecules/`
には投票ボタンやアバターなど無関係なドメインが「粒度が似ているだけ」で並ぶ。
feature 構成では `features/notes/` の中で完結し、PR の diff も 1 ディレクトリに
収まる。パッケージング原則で言う共通閉鎖原則（一緒に変更されるものを
一緒に置く）の違反で、コードを**眺める**ときの整理と引き換えに、
**変更する**ときの局所性を失う。コードは眺める時間より変更する時間の方が長い。

### 3.2 境界に判定器がなく、機械検査できない

molecule と organism の境界は「複雑さ」という連続量を主観で切る作業で、
判定者ごとに答えが変わる。このリポジトリは「静的検査可能なルールはプロンプト
ではなく linter か ast-grep で記述する」を方針にしているが、
「molecules は organisms を import しない」という規則は書けても
「このファイルは molecule である」という前提を機械判定できない。
検査できない分類は、成長（atom として生まれた部品に状態や確認ダイアログが
付いて molecule 相当になる）のたびに、移動コストを払うか分類が嘘になるかの
二択を迫り、時間とともに必ず腐る。

「境界基準をチームで合意して .md にまとめる」という対案も検討したが、
分類基準の合意とは**まだ存在しない部品への先回りの取り決め**である。
これからどんなコンポーネントを作るか予測できない段階では基準は必ず不完全で、
新しい部品のたびに「これはどっち？」の再交渉が発生し、文書は書いた瞬間から
現実とズレ始める。「JSX を返すか」のような中身の**事実**を判定器にすると、
将来どんな部品を作っても判定が自動で決まるため、合意は判定器 1 つで済み、
部品ごとの合意・再交渉が不要になる。実効性も ast-grep が担保するので
人間の注意力に依存しない。

### 3.3 feature 縦割りと掛け算するとスカスカになる

Atomic Design は「全部品が 1 枚のカタログに並ぶ」構成で映える思想で、
ドメインで縦に切った中に持ち込むと各マス目が 0〜2 個になる。
実測: 現在の `features/notes` を Atomic に分類すると
atoms 1 / molecules 2 / organisms 1 / templates 0。
1 個しか入らない箱はクリックコストを増やすだけで、見通しをむしろ悪くする。

### 3.4 「データの流れが見える」はディレクトリの錯覚

ここが今回のレビュー観点への核心の回答になる。

- 依存・包含関係は **DAG（有向非巡回グラフ）**であり、ディレクトリは**木**
  なので、原理的に表現できない。DAG とは「線に向きがあり（note-card →
  sticky-note）、たどっても一周して戻らない」グラフのことで、木との本質的な
  違いは **1 つのノードが複数の親を持てる**こと。

  ```
  木（ディレクトリ）: 親は必ず 1 つ     DAG（import 関係）: 親が複数いてよい

    notes/                              note-card ──→ sticky-note
    ├── note-card    ← 置き場所は1つ        │
    ├── sticky-note                         ↓
    └── notes-reducer                  notes-reducer ←── use-room-notes
                                           ↑ 「使う側」が 2 つある
  ```

  `notes-reducer` は note-card からも use-room-notes からも使われるが、
  ディレクトリではファイルは 1 箇所にしか置けない。つまり「どこに置くか」を
  どれだけ工夫しても「誰から使われるか」の情報は必ず落ちる。配置の巧拙では
  なく、木と DAG という**データ構造の表現力の差**である。
- しかも正しい Atomic Design では organism が atom を**直接** import する
  （階層を経由させるのはむしろアンチパターン）。つまり
  `organisms → molecules → atoms` という「流れ」は建前で、実際の import は
  階層を飛び交う。ディレクトリ階層を見ても「誰が誰を含むか」は分からない。
- Atomic のディレクトリが見せてくれるのは「粒度のラベル」であって
  「データの流れ」ではない。この 2 つの混同が「Atomic の方が流れが見やすい」
  という直感の正体だと考えている。

データの流れが見たい、という欲求自体は正しい。だからこそ、それは
ディレクトリではなく**実測の図**で提供する（次節）。

## 4. 採用した構成: 欲求を 3 つの装置に分解する

「見やすさ」を 1 つのディレクトリ規約に背負わせず、性質の違う 3 つに分けた。

### 4.1 粒度の空間化 → `ui/` / `logic/` の 2 層

- 判定器は「**JSX を返すか**」。返すもの（コンポーネント + 同居する
  spec / stories / fixture）は `ui/`、返さないもの（hook・reducer・
  Server Action・純関数・定数）は `logic/`。
- 判定が中身の**事実**なので、人によって揺れず、レビューで揉めず、
  成長しても再分類が起きない（view が状態を持ち始めたらそれは規約違反で
  あって分類の問題ではない）。Atomic で置き場のなかった非 UI にも
  置き場が定義される。
- 両層が揃わない feature はフラットのまま（例: 表示部品だけの `dot-vote`）。
  「**フラット = 単層**」という構造自体が「この feature は UI しかない」
  という情報になる。
- 境界は ast-grep が CI で機械検査する: `logic/` への JSX 混入、規約外の
  サブディレクトリ（`molecules/` を作るとそこからの相対 import が全て
  エラーになる fail-closed）、feature 外への相対 import 脱出。
- 業界的にも、Atomic 全採用 → feature 回帰を経た現在の収束点
  （Feature-Sliced Design の slices × segments、bulletproof-react）と
  同型の構成である。ui / logic は FSD の segments（ui / model）に相当する。

### 4.2 実物の粒度 → Storybook

全 UI コンポーネントに stories 必須の規約により、`npm run storybook` が
「実物のレンダリング付き部品カタログ」になっている。大きさ・見た目は
名前の解読すら不要で、言語非依存に分かる。

### 4.3 データの流れ → `Dependencies/*`（実測依存図）

import 文の解析から mermaid 図を自動生成し（`npm run deps:diagrams`、
storybook 起動時に自動実行）、Storybook の `Dependencies/*` に常設した。

- features 俯瞰 1 枚（app と feature 間のエッジ = ast-grep 一方通行ルールの実測）
  - feature 別 8 枚（ファイルレベルの依存。ui / logic を subgraph で表示）。
- コードから生成されるので**嘘をつかない・腐らない**。手描きの図や
  ディレクトリ構造と違い、保守コストがゼロ。
- Chromatic が見た目の差分を検出するため、依存の追加・削除が PR 上で見える。
  ast-grep は「違反を止める」、この図は「合法な依存の変化を見せる」という分担。

## 5. Atomic Design が有効な場所

Atomic Design 自体の否定ではない。Brad Frost 自身が「思考のメンタルモデルで
あってディレクトリ構造の処方箋ではない」と述べている通り、有効なのは
**ドメインを持たないデザインシステムそのもの**（Storybook がプロダクトである
ような UI ライブラリ）で、粒度が唯一の分類軸になる場所である。

このリポジトリでは `components/ui/`（shadcn 汎用部品。ドメインを知らないことが
層の価値）がその位置に当たる。現状は部品数が少なくフラットで足りているが、
将来ここが肥大したときに粒度分けを検討する余地はある。境界線は
「大きさ」ではなく「**ドメイン知識の有無**」（contracts を import するか）で
引かれており、これは機械判定できる。

## 参考

- Brad Frost, *Atomic Design* — 原典。メンタルモデルとしての位置づけ
- [bulletproof-react](https://github.com/alan2207/bulletproof-react) /
  [Feature-Sliced Design](https://feature-sliced.design/) — feature 縦割り +
  薄い役割層という業界の収束点
- Common Closure Principle（Robert C. Martin） — 「一緒に変更されるものを
  一緒に置く」パッケージング原則
- 実装: `rules/ast-grep/feature-dependencies-one-way.yml`（境界の機械検査）、
  `scripts/dependency-graph.mts`（依存図の生成ロジック）

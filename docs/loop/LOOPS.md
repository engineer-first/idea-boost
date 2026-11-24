# ループの仕様

[README](README.md) の思想を、実際に回す6つのループに落としたもの。「何を・いつ・どこまで」を定める。
起動は Orca automation、起こすかどうかの判定は [scripts/loop/precheck.mts](../../scripts/loop/precheck.mts)。

## 共通の約束

### 待ち行列は GitHub Issues と PR

| ラベル         | 意味                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| `loop:finish`  | 完成台帳の未達を埋める仕事。replan が作る。チームが付けてループに任せてもよい      |
| `loop:ux`      | 巡回の所見。patrol が作る                                                          |
| `loop:garden`  | 文書・死にコード・重複の整理で、garden が自分で直さなかったもの                    |
| `loop:mend`    | develop の CI を直す PR                                                            |
| `loop:claimed` | ループが着手中。着手コメントに worktree と時刻を書く                               |
| `loop:blocked` | 3周失敗、または前提待ち。理由をコメントに1〜3行                                    |
| `needs-human`  | 人の判断待ち。R2 の PR、R3 の Issue、権限が無くて止まった場所                      |
| `R2`           | 境界に触る（[リスク段階](README.md#リスク段階検証とマージの重さ)）。人がマージする |
| `P0`           | 本番で利用者が進めない、非公開の内容が漏れる。既存の `優先度高い` は P1 として読む |
| `loop:log`     | ループの記録用 Issue（閉じたまま使う）                                             |

ループが拾うのは、`loop:finish` / `loop:ux` / `loop:garden` のどれかが付き、**担当者がいない**、`loop:claimed` / `loop:blocked` / `needs-human` の付いていない open Issue だけ。
Issue Type・PBI との親子・Project 状態・Milestone は [Issue運用](../team/issues.md) のとおりで、ループ用に変えない。ループが作る Issue も [Issue記述ルール](../team/issue-writing.md) で Why を短く書く。

このリポジトリは公開。Issue・PR に個人情報・秘密・ユーザーテスト参加者の発言をそのまま書かない。

### 周回の型（全ループ共通）

1. **向きを確かめる**：`git fetch origin && git rebase origin/develop`。[AGENTS.md](../../AGENTS.md)、この文書、自分の指示書、[completion.json](completion.json) を読む。
2. **1つだけ選ぶ**：自分の待ち行列から優先度順に1件。選んだら即 `loop:claimed`。
3. **やる**：AGENTS.md の「変更前に読む資料」と、段階に応じた検証を回す（下記）。
4. **出す**：PR を作る・更新する（下記）。
5. **学びを残す**：次の周回が同じ失敗をしそうなら、該当する指示書か規約に1行足す（同じ PR で）。
6. **終わる**：`orca worktree set --worktree active --comment` で結果を1行残し、context を捨てる。2件目を始めない。

### PR の作り方

- 本文・Draft の扱い・画面資料は [write-pr](../../.agents/skills/write-pr/SKILL.md) と PR テンプレートに従う。ループ用のテンプレートは作らない。

- Issue 全体を閉じる PR は `feature/<番号>-<内容>` のブランチ名にする（Closes とマーカーが自動で付き、Project 状態が動く）。

- PR に自分のループの `loop:*` ラベルと、R2 なら `R2` `needs-human` を付ける。スマホ縦の見た目を変えたら `mobile` も付ける。

- 本文の末尾に次の2行を置く（ループごとの処理量とリスク配分を `gh pr list --search` で数えるため）。

  ```text
  Loop: finish        # mend / finish / land / patrol / garden / replan
  Risk: R1            # R0〜R2
  ```

- 作成は Draft。自分の検証を終えたら Ready にする（CodeRabbit の初回レビューが始まる。[レビュー運用](../team/code-review.md)）。

### 段階ごとの検証（PR を Ready にする前）

| 段階 | 自分で回すもの                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| R0   | `npm run lint`、`npm run typecheck`、変更箇所に近い `vitest`。文書だけならリンク・整形                                             |
| R1   | 上記＋`npm run test`＋必要なら `npm run test:browser`。`verify` skill で PC（1280）・iPad 幅を実際に操作し、画面資料を PR に付ける |
| R2   | 上記＋`npm run test:workers`。PR を出す前に `authz-security-reviewer` で認可を確かめ、結果を PR にコメントする                     |

振る舞いの変更は AGENTS.md どおり、失敗する Vitest テストから始める。

### 止まり方

- 同じ Issue で3周失敗 → `loop:blocked` を付けて理由を書き、`loop:claimed` を外す。毎回違う理由で落ちるなら2回で止め、条件・設計の見直しを Issue に提案する。
- 拾える Issue が無い → 何もしない（replan が次に作り直す）。
- 人の判断が要る → `needs-human` を付けて次へ。待たない。
- 1回の起動で扱うのは、finish は Issue 1件、land は PR 3本、patrol は新規所見8件まで。暴走とコストの上限を兼ねる。

## セッションの分け方

分ける理由は、context を守る・評価を独立させる・書き込み先を分けて並行させる、の3つだけ。

| 役        | 寿命             | 書いてよい場所                                                           | 回すループ   |
| --------- | ---------------- | ------------------------------------------------------------------------ | ------------ |
| conductor | 1回の再計画      | Issues、`docs/loop/`（PR で）、replan log                                | replan       |
| builder   | 1周（Issue 1件） | claim した Issue の範囲のコード・テスト・文書、completion.json の status | finish, mend |
| lander    | 1回の取り込み    | 対象 PR のブランチ（レビュー対応）、PR のマージ                          | land         |
| patrol    | 1回の巡回        | Issues のみ（コードは読むだけ）                                          | patrol       |
| gardener  | 1回              | 文書、未使用コードの削除                                                 | garden       |
| verifier  | 1件の確認        | PR コメントのみ                                                          | R1/R2 の確認 |

- どの automation も run ごとに新しい worktree（`new_per_run`）で動く。同じ作業ディレクトリを2つのセッションで使わない。
- 人が作業中の場所を避ける：着手前に `gh pr list --state open` で人の PR が触るファイルを見て、重なる Issue は選ばない。
- `git stash` を使わない（worktree 間で共有される）。一時退避は WIP commit で。force push は自分のループのブランチだけ。

## 0. 修理 (mend)

develop が壊れたまま上に積むと、全員の検証が嘘をつき始める。他のどの仕事よりも先に直す（アンドン）。
[テスト方針](../development/testing.md#ci-で回すタイミング)の「develop へのマージ後に落ちたらその PR の作業者が直す」を、作業者が離れているときにループが代わる。

| 項目     | 内容                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------ |
| 起動     | 毎時（precheck つき）                                                                                  |
| precheck | develop への push で走った最新の CI / Browser が失敗し、`loop:mend` の PR が無い                       |
| やること | 失敗を再現（`ci-triage` skill）→ 原因の PR を特定 → 直せれば直す PR、無理なら原因 PR を revert する PR |
| 出力     | `loop:mend` の PR（R0 扱いで land が取り込む。原因 PR の作者へ PR でメンション）                       |
| 指示書   | [prompts/mend.md](prompts/mend.md)                                                                     |

## 1. 完成 (finish)

台帳と現実の差分を、1周1 Issue で埋める主力ループ。

| 項目     | 内容                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| 起動     | 毎時（precheck つき）                                                                         |
| precheck | develop が赤くない、loop の開いた PR が2本未満（`IB_LOOP_MAX_OPEN_PRS`）、拾える Issue がある |
| 入力     | Issue 1件、completion.json、ux-rubric.md（`loop:ux` の場合）                                  |
| 出力     | Ready の PR、completion.json の `status`/`evidence` の更新（同じ PR で）                      |
| 指示書   | [prompts/finish.md](prompts/finish.md)                                                        |

選ぶ順：`P0` → `loop:ux` で `優先度高い` → `loop:finish` で `優先度高い` → その他（番号の小さい順）。
禁止：押しても何も起きないボタン・空のハンドラで台帳を `pass` にすること。未完成なら画面に出さない。

## 2. 取り込み (land)

PR を出した周回は、CI と CodeRabbit を待たずに終わる。待ち時間を周回に抱えないために、取り込みを別のループにした。

| 項目     | 内容                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| 起動     | 30分ごと（precheck つき）                                                                                         |
| precheck | Ready で検査が終わった（成功・失敗どちらも）`loop:*` の PR か Renovate の PR があり、`needs-human` が付いていない |
| やること | CI 失敗は直す。CodeRabbit の指摘は `address-review` skill で対応要否を判断して直し、増分レビューを1回だけ求める   |
| マージ   | R0：必須チェック green＋最新 head のレビュー済み。R1：さらに別 context の確認（`ui-review` か verifier）が合格    |
| 出力     | squash マージ、または `needs-human` を付けて理由をコメント                                                        |
| 指示書   | [prompts/land.md](prompts/land.md)                                                                                |

R2 と人の PR はマージしない。Renovate は [依存の自動更新](#依存の自動更新) のとおり。

### 依存の自動更新

Renovate の patch/minor は GitHub の auto-merge が取り込む。残る major・0.x・失敗した PR を land が扱う。
changelog で破壊的変更を読み、`rg` で使っている箇所を洗い、必要なら同じ PR で呼び出し側を直してマージする（R1）。
移行に設計の変更が要る、本番データや認証の挙動が変わると判断したときだけ、マージせず `needs-human` と理由を書く。

## 3. 巡回 (patrol)

作った人とは別の context が、利用者の旅を実際にブラウザで歩き、所見を Issue にする。

| 項目     | 内容                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------- |
| 起動     | 1日2回（11:00・16:00、precheck つき）                                                               |
| precheck | 前回の巡回から `app/` `features/` `components/` `contracts/` `lib/` `workers/` `public/` が変わった |
| 環境     | ローカル（`verify` skill。開発用ユーザーと2本目のブラウザで複数人を作る）。本番では歩かない         |
| 入力     | [ux-rubric.md](ux-rubric.md) の旅と重大度                                                           |
| 出力     | 所見ごとの `loop:ux` Issue（重複は既存へコメント）、patrol log へのコメント                         |
| 指示書   | [prompts/patrol.md](prompts/patrol.md)                                                              |

本番で歩かないのは、本番の参加には Google かゲストの本人が要り、巡回のルームが実際の利用者の一覧や記録に混ざるため。

## 4. 庭仕事 (garden)

| 項目     | 内容                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------- |
| 起動     | 毎日 05:30（precheck つき）                                                                     |
| precheck | 前回の庭仕事から develop が進んだ                                                               |
| 対象     | 実装と食い違う文書、どこからも使われない export・ファイル、リンク切れ、ループの worktree の残り |
| 出力     | R0 は `loop:garden` の PR で直す。R1 以上と重複の統合案は `loop:garden` Issue                   |
| 指示書   | [prompts/garden.md](prompts/garden.md)                                                          |

## 5. 再計画 (replan)

待ち行列を作り直す。計画は使い捨てで、ずれたら作り直す。

| 項目     | 内容                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| 起動     | 9・13・17・21時（precheck つき）                                                                            |
| precheck | 拾える Issue が無い、`loop:blocked` が3件以上、または前回の再計画から Issue が動いた                        |
| 入力     | completion.json、open Issues と PR、patrol log、develop と本番の差（`$release` の判断材料）                 |
| 出力     | `loop:finish` Issue の作成・並べ直し・統合、3時間動きの無い claim の解除、replan log の本文（現在地）の更新 |
| 指示書   | [prompts/replan.md](prompts/replan.md)                                                                      |

台帳の item を足す・分ける・acceptance を書き直すのは replan だけ（PR で、R0）。弱める・消すときは理由と変更前後の文を PR の設計判断に書く。

## 価値検証（人が主役）

AI の巡回では「初学者チームが迷わずアイデアを決められるか」を確かめられない。このループは人が回し、AI は準備と集計を担う。

- **ユーザーテスト・イベントでの利用**：観察とアンケートは [任意の意見](../operations/feedback.md) の運用で扱い、公開 Issue に参加者の発言を書かない。分かったことは PBI へ。
- **巡回の較正**（月1回程度）：巡回の所見の数件を人が採点し直し、ずれた観点を ux-rubric.md に直す。
- **レビュー**：sprint の review/demo で、replan log の現在地（台帳の進み・取り込んだ PR・人の判断待ち）を見る。

## 人の待ち行列

`needs-human` の Issue と PR。人が見て、決めたらラベルを外す。

- R2 の PR のレビューとマージ。
- R3：PRD 方針・チームの運用・課金や契約・学外への連絡。
- 権限が無くて止まった場所（止まった操作と理由を書く）。

## Orca automation の登録

| 名前        | cron (JST)           | precheck              | 指示書            |
| ----------- | -------------------- | --------------------- | ----------------- |
| `ib mend`   | `10 * * * *`         | `precheck.mts mend`   | prompts/mend.md   |
| `ib finish` | `40 * * * *`         | `precheck.mts finish` | prompts/finish.md |
| `ib land`   | `*/30 * * * *`       | `precheck.mts land`   | prompts/land.md   |
| `ib patrol` | `0 11,16 * * *`      | `precheck.mts patrol` | prompts/patrol.md |
| `ib garden` | `30 5 * * *`         | `precheck.mts garden` | prompts/garden.md |
| `ib replan` | `0 9,13,17,21 * * *` | `precheck.mts replan` | prompts/replan.md |

precheck は origin/develop の `scripts/loop/precheck.mts` を一時ファイルへ書き出して実行する。develop にこのファイルが無い間は失敗して skip になるので、登録しておけばマージした時点から回り始める。

```bash
git fetch -q origin develop && git show origin/develop:scripts/loop/precheck.mts > "${TMPDIR:-/tmp}/ib-precheck.mts" && node --no-warnings "${TMPDIR:-/tmp}/ib-precheck.mts" <loop>
```

止めるときは `orca automations edit <id> --disabled`。全部止めても GitHub 側に残るのはラベルと Issue だけで、人の運用はそのまま続けられる。

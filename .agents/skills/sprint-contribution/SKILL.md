---
name: sprint-contribution
description: idea-boost のスプリント（GitHub milestone）ごとに、PBI 単位の貢献度管理シートを作成して GitHub Discussion にコメント投稿する。引数はスプリント名（milestone title、例 "Sprint 4"）と投稿先 Discussion の URL。末尾に --dry-run を付けると、実際には投稿せず Markdown ファイルの生成までで止める。
argument-hint: <milestone名> <Discussion URL> [--dry-run]
disable-model-invocation: true
---

# スプリント貢献度シート

`$ARGUMENTS` からスプリント名（milestone title）・投稿先 Discussion URL・`--dry-run` フラグの有無を読み取り、そのスプリントの PBI ごとの貢献度シートを作成する。

GitHub Discussion への投稿は外部から見える公開アクションなので、`--dry-run` が付いていない限りそのまま投稿してよい（このスキルは明示的に呼び出されたときだけ動くので、呼び出した時点で投稿の意図があるとみなす）。ただし一次データの解釈にはこのスキル自身の判断が必要な箇所が多い。手順を機械的になぞるだけでなく、途中の判断ポイントでは実際の diff や issue 本文を見て納得してから次に進むこと。

一時ファイルはセッションのスクラッチパスがあればそこに、なければ `/tmp` に作成する。

## 全体の流れ

対象リポジトリは `engineer-first/idea-boost` 固定（`OWNER=engineer-first REPO=idea-boost`）。

### 1. スプリント期間を特定する

```bash
gh api repos/$OWNER/$REPO/milestones --jq 'sort_by(.number)'
```

期間は対象 Milestone の説明に記録された確定開始日と review/demo 日を使う。1 sprint は対象授業6回（開発5回＋review/demo）であり、前の期限や暦の6日から開始日を推測しない。未確定なら期間による PR 検索を保留して、その旨を報告する。

### 2. 完了済みも含む milestone の issue 一覧を取得する

```bash
gh issue list --repo $OWNER/$REPO --milestone "<title>" --state all --limit 1000 \
  --json number,title,state,issueType,assignees
```

この一覧を集計の起点にする。Task / Bug / Spike / 種類なし等の作業 Issue を含め、PBI は目的・受け入れ条件・デモ確認内容の確認先として扱う。親 PBI は開発中・完了後に整理できるため、親なしや親が別 sprint・未割当の作業を除外しない。旧 DemoGoal は履歴参照に留め、別の成果として集計しない。

### 3. 作業 Issue の親 PBI と対応 PR を確認する

GitHub の親子関係を確認して PBI 単位にまとめる。本文中の番号やクロスリファレンスは候補であり、親子関係の確定情報として扱わない。親なしの作業は「PBI 未整理」の欄へ残し、完了済みも含めて後で整理できるようにする。集計だけを理由に Issue を移動・編集しない。

```bash
.agents/skills/sprint-contribution/scripts/fetch_crossrefs.sh $OWNER $REPO <作業Issue番号...>
```

作業 Issue から対応 PR を探し、closing reference・本文・diff で対応を確認する。PBI に直接対応する PR も確認する。PR タイトルにしか番号がない場合はタイトル検索も補助に使う。
PR がない完了済みの作業は、必要なら `git log --oneline -- <path>` で直接コミットを調べる。成果確認や調査だけの作業に、実装 PR の存在を求めない。

### 4. 見つかった PR の author・diff 統計を取得する

```bash
.agents/skills/sprint-contribution/scripts/fetch_pr_stats.sh $OWNER/$REPO <pr番号...>
```

このスクリプトは `package-lock.json` 等のロックファイルを除いた実質 diff（`*_excl_lock`）も一緒に返す。**按分計算には必ずこちらを使う**（生の行数だとロックファイル込みの差分で比率が歪む。実例は script 冒頭のコメント参照）。

`state` が `CLOSED` で `mergedAt` が `null` の PR は develop に取り込まれず破棄されたものなので、貢献度には含めない。別の PR に置き換わったことだけ注記する。

### 5. 複数人のコミットが混ざった PR を見分ける

同じ author 名で PR 全体が計上されていても、実際には他の協力者のコミットが混ざっていることがある（featureブランチが並行開発中の develop を都度取り込んで育つ運用のため）。作業量に対して diff が不自然に大きい・小さい PR や、コミットログを見て複数 author が混在していそうな PR は、マージコミットの親をたどって実際の寄与を分解する:

```bash
# マージコミットの親を確認（1st parent = develop側、2nd parent = feature ブランチ先端）
git show -s --format='%P' <merge_commit_sha>

# 1st..2nd の範囲だけを author 別に集計（develop に元々あったコミットを含めない）
git log --numstat --pretty=format:'COMMIT|%H|%an' <1st-parent>..<2nd-parent> -- . ':!package-lock.json' ':!*.lock' \
  | awk '
    /^COMMIT/{split($0,p,"|"); author=p[3]; next}
    NF==3 {add[author]+=$1; del[author]+=$2}
    END {for (a in add) printf "%-20s add=%-8d del=%-8d total=%d\n", a, add[a], del[a], add[a]+del[a]}
  '
```

逆に、あるファイルが「誰の実装として現存しているか」を確かめたいとき（例: 先行実装 PR が破棄され、別 PR に置き換わった疑いがあるとき）は `git log --follow` や `git blame` でそのファイルの著者を直接確認する方が早い。

### 6. PBI ごとの貢献度を算出する

- 単独 PR・単独 author の PBI: 100%
- 複数 PR・複数 author が関わる PBI: 実質 diff（`*_excl_lock`、必要なら手順5で再分解した値）の合計に対する比率で按分する

1つの PR が複数 PBI にまたがることもある（例: ルーム作成画面とメンバー確認画面を1つの PR でまとめて実装したケース）。その PR の diff をそのまま両方の PBI の分母に入れると二重計上になる。`gh pr view <num> --json files` でファイル一覧を見て PBI ごとに按分できないか試し、按分が難しいほど画面がまたがっている場合は「対応 PR」欄に同じ PR 番号を両方の PBI 行に書いた上で、貢献度は「その PR 全体としての貢献」として扱う（無理に % を分割しない）。

### 7. 未整理の作業と期間内の未対応 PR を確認する

手順2の一覧から PBI に紐づいていない作業 Issue をすべて残す。Task だけに限定せず、Bug / Spike / 種類なしも同じように担当と成果を確認する。
期間が確定している場合は、develop へ merge された PR の取りこぼしも調べる:

```bash
gh pr list --repo $OWNER/$REPO --base develop --state merged --limit 1000 \
  --search "merged:<開始日>..<終了日>" --json number,title,author,mergedAt
```

既に計上した PR を除き、残りだけ diff を確認する。Milestone 未設定や対応 Issue 不明の PR は集計漏れ候補として明記し、期間内という理由だけで sprint へ自動割当しない。

### 8. Markdown を組み立てる

以下の構成で、PBI 未整理の作業も見えるようにする:

```markdown
## 📊 Sprint N（開始日〜終了日）貢献度整理

（集計方法の一言。diff 規模ベースの目安であり、レビュー対応など diff に
現れない貢献は反映しきれない旨を明記する）

### PBI ごとの貢献度

| PBI | 対応 PR | 担当 | 貢献度(目安) |
|---|---|---|---|

（未完了 PBI・破棄 PR の扱いなど特筆事項があれば ⚠️ で注記）

### PBI 未整理の作業

| 作業 Issue | 種類 | 内容・成果 | 担当 |
|---|---|---|---|

（Milestone 未設定・対応 Issue 不明の PR があれば別途注記する）

### 全体所感

（1〜2段落。誰が何を中心に担当したかの総括）
```

ファイルはスクラッチパス（なければ `/tmp`）に保存する。

### 9. 投稿する

`--dry-run` が指定されていなければ、`$ARGUMENTS` の Discussion URL からリポジトリと discussion 番号を取り出して投稿する:

```bash
gh discussion comment <discussion番号> --repo $OWNER/$REPO --body-file <作成した md ファイル>
```

`--dry-run` が指定されている場合は投稿せず、作成した Markdown ファイルのパスと内容をユーザーに提示して終わる。

## 過去の実行例

Sprint 3（PBI-04〜09 が対象）と Sprint 2（PBI-01〜03 が対象）で実際にこの手順を踏んで投稿済み（Discussion #36 の既存コメント参照）。新しいスプリントで迷ったら、これらのコメントを読んで書きぶりの粒度を揃えるとよい。

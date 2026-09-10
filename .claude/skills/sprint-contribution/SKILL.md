---
name: sprint-contribution
description: idea-flow-app のスプリント（GitHub milestone）ごとに、PBI 単位の貢献度管理シートを作成して GitHub Discussion にコメント投稿する。引数はスプリント名（milestone title、例 "Sprint 4"）と投稿先 Discussion の URL。末尾に --dry-run を付けると、実際には投稿せず Markdown ファイルの生成までで止める。
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

milestone に開始日フィールドはないので、「対象 milestone の1つ前の milestone の `due_on`」を開始日とみなし、対象 milestone の `due_on` を終了日とする。

### 2. milestone の issue 一覧を取得する

```bash
gh issue list --repo $OWNER/$REPO --milestone "<title>" --state all --limit 100 \
  --json number,title,state,issueType,assignees
```

`issueType` で PBI / DemoGoal / Task に分類する。PBI 番号の一覧をこの後の起点にする。

### 3. 各 PBI に紐づく Task issue と PR を特定する

PBI issue は直接 PR に `closes` されないことが多く、**PBI ← Task issue ← PR** という2段構造になっている（`closedByPullRequestsReferences` を直接使うと空になりがちなので使わない）。

```bash
.claude/skills/sprint-contribution/scripts/fetch_crossrefs.sh $OWNER $REPO <pbi番号...>
```

結果の `source` が `Issue` なら配下の Task issue、`PullRequest` ならそのまま実装 PR。Task issue が見つかったら、同じスクリプトをもう一段階かけて Task issue に紐づく PR を特定する:

```bash
.claude/skills/sprint-contribution/scripts/fetch_crossrefs.sh $OWNER $REPO <task番号...>
```

PBI 番号が古い（issue 番号が一桁〜二桁など）と `gh issue list` のデフォルト limit に埋もれて Task issue 自体を見失うことがある。milestone に出てこない Task 番号を探すときは `--limit` を大きくして全 issue を取り直す:

```bash
gh issue list --repo $OWNER/$REPO --state all --limit 200 --json number,title,issueType,milestone
```

`fetch_crossrefs.sh` は本文中の `#番号` 参照や commit メッセージ経由の言及を拾うが、**PR タイトルにだけ issue 番号が入っていて本文に何の参照もない PR**（例: 「グルーピング機能実装 #86」）は拾えない。ある Task issue の実装 PR がどうしても見つからないときは、タイトル突合も試す:

```bash
gh pr list --repo $OWNER/$REPO --state merged --search "#<task番号> in:title"
```

まれに実装が PR を介さず develop へ直接コミットされていることもある（小さな修正・ドキュメント調整など）。Task issue や PBI の受け入れ条件が実装済み（issue は closed）なのに手順3・4で PR が1件も見つからない場合は、関連しそうなファイルパスの当たりをつけて `git log --oneline -- <path>` でたどり、該当コミットの author を直接確認する。

### 4. 見つかった PR の author・diff 統計を取得する

```bash
.claude/skills/sprint-contribution/scripts/fetch_pr_stats.sh $OWNER/$REPO <pr番号...>
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

### 7. PBI に直接紐づかない横断 Task を洗い出す

横断 Task（CI整備・基盤移行・ドキュメント・リファクタなど）は milestone が設定されていないことが多いので、「milestone の issue 一覧のうち Task」だけでは見逃す。次の2系統を両方洗い出す:

1. 手順2の milestone issue 一覧のうち `issueType` が Task で、手順3のクロスリファレンスに一度も出てこなかったもの
2. スプリント期間内に develop へ merge された全 PR のうち、手順3・4で PBI/Task に紐づけられなかったもの:

```bash
gh pr list --repo $OWNER/$REPO --base develop --state merged \
  --search "merged:<開始日>..<終了日>" --json number,title,author,mergedAt
```

（2の一覧は数十件になることがあるので、まず `--json number,title,author,mergedAt` の軽量フィールドだけ取得し、手順3・4で既に紐づけ済みの PR 番号を除外してから、残った PR だけ手順4のスクリプトで diff を取る。`--json body` まで含めて一括取得すると出力が肥大化してコンテキストを圧迫するので避ける。）

いずれも手順3・4と同じ要領で担当者を特定する。

### 8. Markdown を組み立てる

以下の構成を必ず守る（過去2回の投稿と揃える）:

```markdown
## 📊 Sprint N（開始日〜終了日）貢献度整理

（集計方法の一言。diff 規模ベースの目安であり、レビュー対応など diff に
現れない貢献は反映しきれない旨を明記する）

### PBI ごとの貢献度

| PBI | 対応 PR | 担当 | 貢献度(目安) |
|---|---|---|---|

（未完了 PBI・破棄 PR の扱いなど特筆事項があれば ⚠️ で注記）

### PBI に直接紐づかない横断Task

| Task | 内容 | 担当 |
|---|---|---|

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

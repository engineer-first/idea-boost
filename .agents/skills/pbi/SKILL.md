---
name: pbi
description: idea-boost の目的・受け入れ条件・デモ確認内容を1件の PBI Issue にまとめて作成する。Task・Bug・Spike・種類なしの作業 Issue は通常のフォームまたは Blank issue から起票する。
---

# PBI を作る

`engineer-first/idea-boost` に PBI を1件作成し、Project #3 の `未整理` に追加する。
[Issue 運用](../../../docs/team/issues.md)を正本とし、DemoGoal 別 Issue は作らない。
作業 Issue は親 PBI なしでも起票・着手でき、開発中・完了後に PBI へ整理できる。

## 手順

1. 既存 Issue・[PRD](../../../docs/prd.md)を確認し、目的と分かる範囲の受け入れ条件・デモ確認内容をまとめる。開始時は大まかでよく、後で追加・変更できる。
2. 一時 JSON spec を `/tmp` 等に作り、共有スクリプトを `--dry-run` で実行してタイトル・本文を確認する。
3. 実行して PBI を1件作成し、Type `PBI`、Project #3、Status `未整理`を確認して URL を報告する。

Milestone は定期自動割当に任せる。反映待ち・対象期間外でも起票や作業を進めてよい。

## 本文と spec

ユーザーストーリーは「誰が、何をしたいか、なぜ必要か」という価値を書く。
操作がある受け入れ条件・デモ確認内容は「誰が・どの画面で・何をすると・何が見えるか」を1行で示す。
操作のない成果は確認できる状態を書き、未確定の画面名は仮と明記する。
受け入れ条件だけでデモ確認も伝わるなら、同じ内容を複製しない。

```json
{
  "repo": "engineer-first/idea-boost",
  "project_owner": "engineer-first",
  "project_number": 3,
  "pbi": {
    "title": "チームのアイデアを比較する",
    "story": "参加者としてアイデアを比較したい。次に進める案を選びたいからだ。",
    "acceptance": ["参加者がアイデア一覧を開くと、チームの案を比較できる"]
  },
  "demo_goals": [{
    "title": "2人で確認する",
    "goal": "参加者が案を追加すると、もう1人のアイデア一覧にも表示される",
    "checks": ["2つの画面で同じ案を確認する"]
  }]
}
```

`pbi.title` と `pbi.story` は必須。`milestone`、`pbi.acceptance`、`pbi.memo`、`demo_goals` は任意。
`demo_overview`、`demo_goals[].risks`、`not_doing` も PBI 本文へ保持する。
ID は作成された Issue 番号から確定する（例: #340 → `PBI-340`）。既存採番を維持する場合だけ `pbi.id` を指定する。

```bash
python3 .agents/skills/pbi/scripts/create_planning_issues.py --dry-run /tmp/pbi-spec.json
python3 .agents/skills/pbi/scripts/create_planning_issues.py /tmp/pbi-spec.json
```

共有スキルの正本にあるスクリプトを使う。dry-run は外部通信せず `PBI-00` を仮表示する。
`gh` に repo / project の権限が必要。作成後に失敗したら、作成済み URL から改題・Project 登録を復旧し、重複する全体再実行をしない。
既存 DemoGoal の移行・close はこのスキルでは行わない。

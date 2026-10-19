# PBI作成spec

新規作成の依頼があるときに使う。運用・採番の正本は[Issue運用](../../../../docs/team/issues.md)。
一時JSONをスクラッチパスや `/tmp` へ保存し、リポジトリルートから実行する。

```json
{
  "repo": "engineer-first/idea-boost",
  "project_owner": "engineer-first",
  "project_number": 3,
  "pbi": {
    "genre": "CANVAS",
    "title": "チームのアイデアを比較して次に進める案を選べる",
    "story": "参加者として、チームのアイデアを比較したい。なぜなら、次に進める案を選びたいからだ。",
    "why": "案が別々の場所にあり、参加者が比較するために画面を行き来している。",
    "acceptance": ["参加者がアイデア一覧を開くと、チームの案を比較できる"]
  }
}
```

`pbi.title` と `pbi.story` は必須。ID未指定なら `pbi.genre` も必須。
基本の6ジャンルで目的を表せない場合は追加ジャンルも使える。コードは大文字英字で始まる大文字英数字（例：`ACCESS`）。既存分類とのずれと追加理由は検討内容へ残す。
ジャンル付きIDは作成されたIssue番号から確定する（例：CANVAS、#340 → `PBI-CANVAS-340`）。
dry-runの `PBI-CANVAS-00` は仮表示で、入力specを書き換えない。
既存採番を保持する場合は `pbi.id` を指定する（例：`PBI-CANVAS-04`）。ジャンルも指定する場合はIDと一致させる。
旧 `PBI-12` も明示入力の互換性を保つが、新規採番には使わない。既存PBIを更新するためにこの作成スクリプトを実行しない。

`pbi.why` はWhyの本文、`pbi.acceptance` は「期待する振る舞い」の配列。新規の草案では両方を記入する。
旧specも受け付け、Whyがない場合は背景が未確認であることを本文に表示する。

`milestone`、`pbi.why`、`pbi.acceptance`、`pbi.memo`、`demo_goals` は任意。
既存入力の `demo_overview`、`demo_goals[].risks`、`not_doing` は本文へ保持する。
デモを別に書く必要がある場合の形：

```json
{
  "demo_goals": [{
    "title": "2人で確認する",
    "goal": "参加者が案を追加すると、もう1人のアイデア一覧にも表示される",
    "checks": ["2つの画面で同じ案を確認する"]
  }]
}
```

```bash
python3 .agents/skills/pbi/scripts/create_planning_issues.py --dry-run /tmp/pbi-spec.json
python3 .agents/skills/pbi/scripts/create_planning_issues.py /tmp/pbi-spec.json
```

`gh` にrepo / projectの権限が必要。作成済みURLが返った後に失敗したら、そのIssueの改題・Project登録を復旧する。全体を再実行して重複を作らない。

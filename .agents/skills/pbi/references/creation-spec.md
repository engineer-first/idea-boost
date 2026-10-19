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

`pbi.title` と、`pbi.why` または互換用の `pbi.story` が必須。新規起票はWhy中心とし、ユーザーストーリーは任意。ID未指定なら `pbi.genre` も必須。
基本の6ジャンルで目的を表せない場合は追加ジャンルも使える。コードは大文字英字で始まる大文字英数字（例：`ACCESS`）。既存分類とのずれと追加理由は検討内容へ残す。
ジャンル付きIDは作成されたIssue番号から確定する（例：CANVAS、#340 → `PBI-CANVAS-340`）。
dry-runの `PBI-CANVAS-00` は仮表示で、入力specを書き換えない。
既存採番を保持する場合は `pbi.id` を指定する（例：`PBI-CANVAS-04`）。ジャンルも指定する場合はIDと一致させる。
旧 `PBI-12` も明示入力の互換性を保つが、新規採番には使わない。既存PBIを更新するためにこの作成スクリプトを実行しない。

`pbi.why` はWhyの本文、`pbi.acceptance` は「ユーザーに提供する体験」の配列。ユーザーに提供する体験はWhyで体験が伝われば省略できる。空の任意節は出力しない。
旧specも受け付け、Whyがない場合は背景が未確認であることを本文に表示する。

`milestone`、`pbi.acceptance`、`pbi.memo`、`demo_goals` は任意。`pbi.why` と `pbi.story` は少なくとも一方を記入する。
既存入力の `demo_overview`、`demo_goals[].risks`、`not_doing` は本文へ保持する。
既存JSONの `acceptance` / `demo_goals` というキー名は互換のため維持する。出力は「ユーザーに提供する体験」へまとめ、代表確認は必要な場合だけ短く添える。独立した「デモ確認内容」欄や詳細テスト一覧は作らない。
補足が必要な場合の入力例：

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

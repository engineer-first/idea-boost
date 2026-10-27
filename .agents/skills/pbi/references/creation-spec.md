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

`pbi.title` に何ができるかを表すタイトル、`pbi.story` に誰が何をなぜ望むかを書く。新規起票はWhy中心とし、本文は見出しなしの冒頭ユーザーストーリー → Why → 必要な体験補足の順にする。ID未指定時は、自動採番に使う `pbi.genre` を指定する。
基本の6ジャンルで目的を表せない場合は追加ジャンルも使える。コードは大文字英字で始まる大文字英数字（例：`ACCESS`）。既存分類とのずれと追加理由は検討内容へ残す。
ジャンル付きIDは作成されたIssue番号から確定する（例：CANVAS、#340 → `PBI-CANVAS-340`）。
dry-runの `PBI-CANVAS-00` は仮表示で、入力specを書き換えない。
既存採番を保持する場合は `pbi.id` を指定する（例：`PBI-CANVAS-04`）。ジャンルも指定する場合はIDと一致させる。
旧 `PBI-12` も明示入力の互換性を保つが、新規採番には使わない。既存PBIを更新するためにこの作成スクリプトを実行しない。

`pbi.why` はWhyの本文、`pbi.acceptance` は「ユーザーに提供する体験」の配列。体験の欄は、Whyの説明と重複させず、ユーザーができることを伝える。空欄の補足節は出力しない。
旧specも受け付け、Whyがない場合は背景が未確認であることを本文に表示する。

`milestone` は割当先、`pbi.acceptance` は体験、`pbi.memo` は判断に役立つ補足、`demo_goals` は代表確認に使う。分かっている内容から記入し、検討が進んだ分を追記する。旧specのWhy省略は引き続き受け付けるが、新しい草案では `pbi.why` に現状の事実と影響を書く。
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

## 任意の Story points

AIは[見積もりの目安](../../../../docs/team/issues.md#見積もりの目安)からなるべく選び、`pbi.story_points` に数値で渡す（例: `"story_points": 2`）。省略・`null` は未設定。0.1 / 1 / 2 / 3 / 5 / 8 / 13 以外、文字列やbooleanは設定をスキップする。SPだけの入力不備で起票を止めず、既定値で補わない。

`--dry-run` は本文外に候補を表示し、通信しない。実行時は作成・採番後、今回のIssueがPBIであること、組織に同名Number fieldが1つだけあること、現在値が空欄であることを確認してPOSTし、読み戻す。設定値は本文へ埋め込まない。

結果は `set`（読戻し済み）、`preserved`（既存値を保持）、`skipped`（省略・不正値・対象外・field未整備）、`unconfirmed`（API失敗や読戻し不一致）。SP設定の失敗後も通常のProject登録へ進む。書込み後の通信失敗では設定済みの可能性があるため、再実行せず先に値を読む。スクリプトはフィールド新設・公開範囲変更・既存Issue再見積もりを行わない。

根拠は通常の説明に一言添えればよい。数値を保存できなかった場合も起票済みURLと結果を伝え、追加入力や採用時レビューを求めない。

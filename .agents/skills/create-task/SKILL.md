---
name: create-task
description: IdeaBoostのTaskを新規起票するときに使う。Why中心に作業をまとめ、既知の親PBIへ紐付け、任意のEstimate Hoursを設定する。既存Taskの一括見積もりやPBI自体の起票は扱わない。
---

# Taskを起票する

[Issue運用](../../../docs/team/issues.md)と[Issue記述ルール](../../../docs/team/issue-writing.md)を読む。以下はリポジトリルートから実行する。

1. 依頼から作業が必要な理由を短くまとめる。Whyを中心に、分かっているHow・作業完了条件だけ添える。How未定で起票・着手を止めない。新しいPBIを考える依頼は[pbi](../pbi/SKILL.md)へ渡す。
2. 会話や既に読んだ資料で親PBIが分かっていれば指定する。親未整理でもTaskを作れる。見積もりだけのために関連Issue群を巡回しない。
3. PBI配下なら[時間の目安](../../../docs/team/issues.md#時間を考える目安)で、実装・調査・検証を含む全体作業量をなるべく見積もる。短い根拠を草案・結果の説明へ添える。材料不足なら省略し、時間だけの追加返答を待たない。固定3h、SPからの換算、実消費・残時間としての記録はしない。大きい値を丸めず、人が任意に分割判断できるようにする。
4. 下記JSONを一時ファイルへ書き、dry-runでタイトルと本文を確認する。起票を依頼されていれば実行へ進む。相談だけなら草案を示す。
5. 作成URLを報告し、Issue Type・親子関係・Project自動追加が反映したことを読み取りで確認する。Project状態・Milestoneは既存の自動運用に従う。見積もりの省略・失敗で起票をやり直さず、返答待ちや催促を追加しない。

```json
{
  "title": "入力後も付箋を書き続けられるようにする",
  "why": "追加ボタンへ移動する操作で入力の流れが途切れる。",
  "how": "既存の付箋追加処理を利用する。詳細は実装時に検討する。",
  "completion": "付箋を追加した後、そのまま本文を書き始められる。",
  "parent_pbi": 123,
  "estimate_hours": 2
}
```

例のIssue番号と時間は架空で、実行時は既知の対象と根拠に置き換える。必須は `title` と `why` だけ。`parent_pbi` はこのrepoのIssue番号で、省略可能。`estimate_hours` は正の有限数（小数可）、不明なら省略する。本文に見積もり欄は追加しない。

```bash
python3 .agents/skills/create-task/scripts/create_task.py /tmp/task-spec.json --dry-run
python3 .agents/skills/create-task/scripts/create_task.py /tmp/task-spec.json
```

作成先は `engineer-first/idea-boost` 固定。スクリプトは指定親を一度取得しPBIであることを確認後、公式[Create an issue](https://docs.github.com/en/rest/issues/issues#create-an-issue)の `type` と `parent_issue_id`（Issue番号ではなくdatabase ID）で作成する。親指定が誤っている場合は誤接続を避け起票前に止まる。作成結果が不明なら、GitHubで有無を確認するまで再実行しない。

任意見積もりは起票後の別処理にする。作成APIは `issue_field_values` の同梱にも対応するが、見積もり権限・設定不備で起票を妨げないため同梱しない。今回作ったIssueのTypeと直上の親PBIを読み戻し、組織の `Estimate Hours / number` が一意に見つかり、既存値が空のときだけ[POST](https://docs.github.com/en/rest/issues/issue-field-values#add-issue-field-values-to-an-issue)で1fieldを送る。PUTは他fieldを消すため使わない。読戻しの間に人が入力する競合を原子的に防ぐAPIではないため、新規起票直後の一度に限定し、失敗・不明時に書込みを再試行しない。

`set` は読戻し一致、`preserved` は既存値保持、`skipped` は材料・対象・fieldの条件不足、`unconfirmed` はAPI失敗または読戻し未確認を示す。既存Taskへの補充・ラベル移行・field作成・権限拡大は行わない。既存時間ラベルを新規追加しない。

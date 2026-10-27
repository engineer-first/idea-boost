---
name: create-work-issue
description: IdeaBoostの作業Issueを新規起票するときに使う。Task・Bug・調査など種類を限定せずWhy中心にまとめ、既知の親へ紐付け、PBI配下の末端作業に任意のEstimate Hoursを設定する。既存Issueの一括見積もりやPBI自体の起票は扱わない。
---

# 作業Issueを起票する

[Issue運用](../../../docs/team/issues.md)と[Issue記述ルール](../../../docs/team/issue-writing.md)を読む。以下はリポジトリルートから実行する。

1. 依頼から作業が必要な理由を短くまとめる。Whyを中心に、分かっているHow・作業完了条件だけ添える。How未定で起票・着手を止めない。PBIを考える依頼は[pbi](../pbi/SKILL.md)へ渡す。
2. 種類は目的に合わせ、既存のIssue Typeを指定する。親が既知なら指定し、親未整理でも作業Issueを作れる。見積対象は種類の列挙で制限せず、PBIを祖先に持つ非PBI・子Issueなしの作業単位とする。途中の親作業にも時間を付けて二重計上しない。
3. [時間の目安](../../../docs/team/issues.md#時間を考える目安)で、実装・調査・検証を含む全体作業量をなるべく見積もる。短い根拠を草案・結果の説明へ添える。材料不足なら省略し、時間だけの追加返答を待たない。固定3h、SPからの換算、実消費・残時間としての記録はしない。大きい値を丸めず、人が任意に分割判断できるようにする。
4. 下記JSONを一時ファイルへ書き、dry-runで本文を確認する。起票を依頼されていれば実行へ進む。相談だけなら草案を示す。
5. 作成URLを報告し、Issue Type・親子関係・Project自動追加が反映したことを読み取りで確認する。Project状態・Milestoneは既存の自動運用に従う。見積もりの省略・失敗で起票をやり直さず、返答待ちや催促を追加しない。

```json
{
  "title": "入力後も付箋を書き続けられるようにする",
  "why": "追加ボタンへ移動する操作で入力の流れが途切れる。",
  "issue_type": "Task",
  "how": "既存の付箋追加処理を利用する。詳細は実装時に検討する。",
  "completion": "付箋を追加した後、そのまま本文を書き始められる。",
  "parent_issue": 123,
  "estimate_hours": 2
}
```

例のIssue番号と時間は架空で、既知の対象と根拠に置き換える。必須は `title` と `why` だけ。`issue_type` は省略時Task、`null` なら種類なし、PBIは指定不可。未知の新しいtypeも、GitHubに存在する非PBIの名前なら指定できる。`parent_issue` はこのrepoのIssue番号で、省略可能。`estimate_hours` は正の有限数（小数可）、不明なら省略する。本文に見積もり欄は追加しない。

```bash
python3 .agents/skills/create-work-issue/scripts/create_work_issue.py /tmp/work-issue.json --dry-run
python3 .agents/skills/create-work-issue/scripts/create_work_issue.py /tmp/work-issue.json
```

作成先は `engineer-first/idea-boost` 固定。指定親を一度取得し、公式[Create an issue](https://docs.github.com/en/rest/issues/issues#create-an-issue)の `type` と `parent_issue_id`（Issue番号ではなくdatabase ID）で作成する。作成結果が不明なら、GitHubで有無を確認するまで再実行しない。

任意見積もりは起票後の別処理にする。作成APIは `issue_field_values` の同梱にも対応するが、見積もり権限・設定不備で起票を妨げないため同梱しない。今回作った非PBIの子件数0と指定親を読み戻し、[最大8段](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)の親チェーンでPBIを確認する。親の判定に必要な読み取りだけを行い、根拠集めの関連Issue巡回はしない。所属や子件数が確認できなければ設定しない。

組織の `Estimate Hours / number` が一意に見つかり、Public（RESTの `visibility: all`）と正の整数IDを確認でき、既存値が空のときだけ[POST](https://docs.github.com/en/rest/issues/issue-field-values#add-issue-field-values-to-an-issue)で1fieldを送る。PUTは使わない。空欄確認とPOSTは原子的ではないため、新規起票直後の一度に限定し、失敗・不明時に書込みを再試行しない。

`set` は読戻し一致、`preserved` は既存値保持、`skipped` は材料・対象・fieldの条件不足、`unconfirmed` はAPI失敗または読戻し未確認を示す。既存Issueへの補充・ラベル移行・field作成・権限拡大は行わない。既存時間ラベルを新規追加しない。

field作成後は `gh api orgs/engineer-first/issue-fields` の `id`・`node_id`・`name`・`data_type`・`visibility` を管理者の作成結果と照合する。この一覧APIはpin対象を返さないため、作業に使う非PBI typeへのpinは組織設定UIで別途確認する。pinは表示設定であり、未知type・種類なしを含め適用対象を限定する機能ではない。

---
name: pbi-demogoal
description: idea-boost の PBI issue と、それに紐づく DemoGoal issue のみを作成する。PBI と統合 DemoGoal を engineer-first/idea-boost と組織 Project #3 に正しい Issue Type・milestone・初期状態で追加したいときに使う。Task・Bug・Spike issue の作成には使わない。
---

# PBI DemoGoal

`engineer-first/idea-boost` に PBI issue 1件と、それに紐づく DemoGoal issue 1件を作成するスキル。Issue Type・状態・PR の扱いは [Issue 運用](../../../docs/issue-management.md)を正本とする。

Task・Bug・Spike issue の作成にはこのスキルを使わない。それらは GitHub Issue Forms から作成し、Project の auto-add が取り込む。すべての新規 Issue の初期状態は `未整理`。

## 手順

1. 既存 Issue と PBI の文脈を確認する。ID は手で決めず、作成スクリプトに全 Issue から自動採番させる。
2. ユーザーの依頼を1つの JSON spec に変換する。
3. `create_planning_issues.py --dry-run <spec.json>` を実行し、生成される issue タイトル・本文を確認する。
4. `create_planning_issues.py <spec.json>` を実行して issue を作成する。
5. 作成した2件の Issue が以下を満たすことを確認する:
   - Issue Type: `PBI` または `DemoGoal`
   - Project: `idea-boost`
   - Status: 両方 `未整理`
6. 作成した issue の URL と、Project フィールドの確認結果を報告する。

## ユーザーストーリー（`pbi.story`）の書き方

テンプレート: `{立場}として、{したいこと}。なぜなら、{理由}だからだ。`（「なぜなら、」は省略してもよいが、理由は必ず「〜からだ」で終える）

- 主語は必ずユーザーの立場（ホスト、参加者、閲覧者、管理者、チームなど）にする。「システムは」のような開発者視点の主語は使わない。
- 個人の役割に閉じないPBI（本番デプロイなど、チーム全体が受益者になるもの）では、主語を「チーム」としてよい。
- 理由は本人が得る価値で終える。実装上の都合（パフォーマンス改善など）を理由にしない。
- 参考例（他プロダクトの例。役割・行動・理由の組み合わせが変わるだけで型は同じであることを示すために使う）:
  - 閲覧者として投稿された記事の詳細な内容を参照したい、自分が知りたい情報があるか確認したいからだ。
  - 質問者として分からないことを質問でき、多くの人が見てくれる場所がほしい、たくさんの人から答えが欲しいからだ。
  - 管理者としてユーザー（学生、教員）にパスワードを変更させたい。セキュリティを高めたいからだ。
- ストーリーポイントはこのスキルのスコープ外。`pbi` オブジェクトに含めない。

## デモゴール（`demo_goals[].goal`）の書き方

テンプレート: `{画面や操作}すると／を見ると／では常に、{ユーザーが画面で確認できる結果}になる。`

- 主語は画面・操作などユーザーが実際に触れるもの。API・状態・DB・WebSocket・reducer のような実装用語を書かない。書いたあとに読み返し、開発文脈が混じっていないか確認する。
- 1エントリ = 1つの独立して検証できる事実にする。複数の確認をまとめて書かない（まとめたくなったら `demo_goals` を分割するか、追加の観点は `checks` に逃がす）。
- UI 操作だけで再現・確認できることを条件にする。裏側の実装が正しいことではなく、ユーザーが画面上で見て分かる結果を書く。
- 例（Idea Boost のユーザー価値に沿う。具体的な操作・結果は PRD / Wiki の現行仕様を確認してから書く）:

  > 利用者として、チームで出したアイデアを整理して比較したい。
  > なぜなら、次に進める案をチームで選びたいからだ。

  デモゴール例:

  - アイデア出し画面でアイデアを追加すると、そのアイデアがカードとして一覧に表示される。
  - アイデアをグループに移動すると、そのグループ内にカードが表示される。

  これらの確認可能な結果を `demo_goals` の各エントリに対応させる。機能の存在や正確な画面名は、必ず現行の PRD / Wiki で確かめる。

## Spec のフォーマット

一時的な JSON ファイルをスキルフォルダの外（例: `/tmp` 配下）に作成する。

```json
{
  "repo": "engineer-first/idea-boost",
  "project_owner": "engineer-first",
  "project_number": 3,
  "milestone": "Sprint 2",
  "demo_overview": "チームで出したアイデアを整理して、次に進める案を選べる状態をデモする。",
  "pbi": {
    "title": "チームのアイデアを整理する",
    "story": "利用者として、チームで出したアイデアを整理して比較したい。次に進める案を選びたいからだ。",
    "acceptance": [
      "アイデアを整理して比較できる",
      "チームで次に進める案を選べる"
    ],
    "memo": []
  },
  "demo_goals": [
    {
      "title": "追加したアイデアがカードで表示される",
      "goal": "アイデア出し画面でアイデアを追加すると、そのアイデアがカードとして一覧に表示される。",
      "checks": ["追加したアイデアの内容がカードに表示される"]
    }
  ],
  "not_doing": ["CI環境の統一はスコープ外"]
}
```

補足:

- `milestone` を省略するのは、ユーザーが明示的にスプリント milestone なしを望む場合のみ。
- `pbi.title` には ID を含まない人間可読なタイトルだけを入れる。ID（`PBI-XX`）はスクリプトが既存 Issue から自動採番する。手動の `pbi.id` は既存の採番を維持する明示的理由がある場合だけ使う。
- デモ issue のタイトルは PBI から導出される: `DEMO-<PBI番号> <PBIタイトル>`。
- レビュー可能な成果はそれぞれ `demo_goals` に入れる。スクリプトがそれらをすべて1つの DemoGoal issue にまとめてレンダリングする。
- `memo` は実装タスク候補・未解決事項・ホワイトボード上のメモなどに使う。
- `demo_overview` を省略すると既定文（`<PBIタイトル> として、以下の状態をスプリントレビューでデモする。`）にフォールバックする。デモの見せ方を変えたいときだけ指定する。
- `not_doing` は明示的にスコープ外とする項目に使う。全デモゴールの後に `## やらないこと` セクションとしてレンダリングされる。
- `demo_goals` 内の `risks` はそのゴール固有の注意点に使う。該当ゴールの下にだけ `リスク:` リストとしてレンダリングされる。

## スクリプト

このスキルと Codex スキル（`.codex/skills/pbi-demogoal/`）は同じスクリプトを共有する。`--dry-run` は次の PBI ID を読み取るため `gh` 認証を使うが、Issue は作成しない。リポジトリのルートから実行する:

```bash
python3 .agents/skills/pbi-demogoal/scripts/create_planning_issues.py --dry-run /tmp/idea-flow-spec.json
python3 .agents/skills/pbi-demogoal/scripts/create_planning_issues.py /tmp/idea-flow-spec.json
```

このスクリプトはラベルではなく Issue Type を使う。`gh auth status` が `repo` と `project` の scope を持っていることを確認しておく。

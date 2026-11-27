---
id: "0034"
date: "2026-11-27"
---

# ADR 0034: ループの作業の待ち行列は GitHub Issue に置き、beads へは移さない

## Context

ループ（ADR 0031）は、待ち行列と状態を GitHub Issue とラベル（`loop:ready`・`claimed`・`blocked`・`needs-human`・`loop:ux`）で持つ。replan が Issue を整え、build が1件拾い、precheck が gh CLI でラベルを数えて起こすかを決める。チーム（5人前後）とオーナーは、Issue・PR と Discord のマージ通知でループの動きを追っている。人に割り当てられた Issue もあり、ループは担当者がオーナーか未設定の Issue だけを拾う。

2026-11-27、オーナーは、Issue の代わりに beads（`bd`）や、それを Claude Code から使うプラグイン oh-my-beads を使うことも含めて、前提を疑い、AI エージェントが開発しやすい形へ寄せることを求めた。beads は Dolt（版管理つき SQL）に Issue を置く CLI で、依存関係のグラフ、`bd ready` による着手可能の判定、`--claim` による取り合いの無い着手、古い Issue の要約を持つ。

2026-11-27 時点の運用の実測は次のとおり。

- ループの PR は 2026-11-24〜27 に 91 本。同じ Issue に2つの周回が同時に着手した例は無い（`loop/build-1333` と `-2` は続きの PR）。
- open の `loop:ready` は2件、`claimed` は1件、`blocked`・`needs-human` は0件。待ち行列は replan が5件までに保つ。
- Issue 同士の依存関係は使っていない。GitHub の Issue には、sub-issue と blocked-by の依存関係を API で持てる。
- ループは Orca automation が run ごとに新しい git worktree を作り、同じ PC の上で並行して動く。リポジトリは公開で、Issue も公開されている。

beads の README と文書（2026-11-27 の main）では、データは `.beads/` の Dolt に置き、別の clone とは git remote の `refs/dolt/data` へ `bd dolt push / pull` で同期する。既定の組み込みモードは1つのプロセスしか書けず、並行して書くには Dolt のサーバーを常駐させる。リリースは v1.4.0 の RC が続き、schema の migration を伴う版上げでは1台だけが migrate する手順を求める。oh-my-beads は bd v1.0.4 と v1.1.2 だけを検証対象にし、v1.1.0 は既存の DB を開けなくすることがあると書いている。

## Decision

ループの作業の待ち行列と状態は GitHub Issue とラベルに置き続け、beads と oh-my-beads は入れない。代わりに、beads が AI に楽にしている点を Issue の運用に取り込む。

- 次に拾う1件を、エージェントが一覧を読んで選ぶのではなく、precheck と同じ判定のスクリプトが1件だけ JSON で返す形にする（`bd ready --json` に当たる）。
- 前提の作業がある Issue は GitHub の blocked-by で結び、前提が open の Issue を着手可能に数えない（beads の依存グラフに当たる）。
- 着手は、ラベルと担当者を付けた後に読み直して、ほかの周回と重なっていないことを確かめる（`--claim` に当たる）。

beads を入れない理由は3つある。

- いま困っていることを直さない。取り合い・依存関係・着手可能の判定は、どれも今の規模（待ち行列5件、ループの PR は同時に2本まで）で問題になっていない。困りやすいのは選ぶときに一覧を読む context と手順のぶれで、これは Issue の上で直せる。
- 見え方と入口が2つに割れる。人の起票・人の担当・`loop:skip`・`loop:stop`・Discord の通知は GitHub に残るので、ループの作業だけ beads に置くと、同じ仕事を Issue と bead の両方で持ち、同期が要る。チームは bd を入れないと、ループが何を待ち、何に詰まっているかを見られない。
- 「状態はリポジトリに」と合わない形で動かす必要がある。run ごとの worktree が同じ状態を読むには、親の clone の `.beads` を共有するか Dolt のサーバーを常駐させる必要があり、状態がオーナーの PC に寄る。別の PC やクラウドのループと共有するには、公開リポジトリへ `refs/dolt/data` を push する必要がある。加えて、変化の速い版と schema の migration を、ループの PC で管理する仕事が増える。

### 本ADRで決定しないこと

1件を返すスクリプトの形、blocked-by の使い方、着手の確かめ方は、[ループ開発](../loop/README.md)と各ループの指示書、[precheck](../../scripts/loop/precheck.mts) で、References の Issue を通じて決める。チーム全体の Issue の運用は [Issue運用](../team/issues.md) に置く。

## Consequences

- 良い影響：チームは今までどおり Issue・PR・Discord でループを追える。人とループの入口が1つのままで、同期の仕組みも bd の版の管理も要らない。
- 良い影響：1件を返すスクリプトと blocked-by で、build が毎回一覧を読んで選ぶ context と、周回ごとの選び方のぶれが減る。
- 悪い影響：beads の要約（古い Issue を短くして context を節約する）や、セッションをまたぐ記憶の仕組みは得られない。gh CLI の呼び出しは bd よりも遅く、GitHub の API の制限を受ける。
- 悪い影響：ラベルでの着手は1回の操作で原子的にならない。読み直しで重なりに気づけるが、同時に2つの周回が同じ Issue を選ぶことは完全には防げない。
- 中立：beads は活発に開発されており（2026-11-27 に main へ push、MIT）、Issue との同期（`bd github sync`）もある。採らないのは今の規模と構成での判断で、道具の良し悪しの判断ではない。
- 判断の出どころ：beads や oh-my-beads を使うことも含めて前提を疑うことは、オーナーが 2026-11-27 に求めた。入れない判断と代わりの3点は AI の提案で、オーナーが個別に選んだ記録はない。
- 見直す条件：
  - ループの PR の同時の上限を増やし、同じ Issue を2つの周回が選ぶ重なりが実際に起きたとき。
  - 1つの改善が前提の作業の連なりになることが増え、blocked-by では追えなくなったとき。
  - ループを複数の PC やクラウドで動かし、Issue の読み書きの速さや API の制限が周回を止めるようになったとき。

## Alternatives Considered

- ループの作業管理だけを beads に移し、人が見る必要があるものだけを Issue に同期する案：取り合い・依存・着手可能の判定は bd に任せられる。ただし同期の向きと対象を決めて保ち続ける仕事が増え、今の規模では得るものより割れる見え方と運用の重さが大きい。
- oh-my-beads を Claude Code のプラグインとして入れる案：破壊的な bd の操作を止める hook や、過去の作業を思い出す skill を持つ。bd の特定の版に固定されており、ループのエージェントの起動時に hook と指示を差し込むため、AGENTS.md と `.agents/skills` の指示と二重になる。beads を入れない前提では使えない。

## Related ADRs

- ADR 0031：ループで改善から本番公開までを回す判断。この ADR は、その待ち行列を GitHub Issue に置くことを決める。

## References

- 委譲先：[ループ開発](../loop/README.md)、[build の指示書](../loop/prompts/build.md)、[precheck](../../scripts/loop/precheck.mts)、[Issue運用](../team/issues.md)。代わりの3点は #1410 で進める。
- 2026-11-27：オーナーが、Issue の代わりに beads や oh-my-beads を使うことも含めて前提を疑い、AI エージェントの開発に寄せることを求めた。
- [beads](https://github.com/gastownhall/beads)：README、`docs/reference/worktrees.md`、`docs/architecture/dolt.md`、`docs/multi-agent/coordination.md`、リリース一覧（2026-11-27 確認、MIT）。
- [oh-my-beads](https://github.com/AI-Driven-R-D-Dept/oh-my-beads)：README（2026-11-27 確認、MIT、最終 push 2026-10-20）。
- 運用の実測：`gh pr list --label loop --state all` と `gh issue list --label loop:ready|claimed|blocked|needs-human`（2026-11-27 確認）。
- [GitHub の Issue の依存関係](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)（2026-11-27 確認）。

---
id: "0036"
date: "2026-11-27"
---

# ADR 0036: ループは必須チェックを待たずに auto-merge を予約し、PR の必須チェックは分割して並列に回す

## Context

ADR 0031 でループが改善から公開までを回すようになり、2026-11-25〜27 の約29時間で、ループの PR が43本 develop へマージされた。作成からマージまでの中央値は約18分だった。そのうち、全部の push で CI と Browser が動いていた時間（重なりを除く）は中央値で約16分、合計で約8割を占めた。周回は `gh pr checks --watch` で必須チェックを待ってからマージしており、最後のチェックが終わってからマージまでは中央値で約30秒だった。周回の時間の大半は CI 待ちだった。

最後の commit の必須チェックは中央値で約7分かかり、律速は browser（中央値約7分、うち検査の実行が約5分半）と test（約4分、うち unit が約2分）だった。lint と build は約1分で、ジョブの起動待ち（runner の取り合い）はほぼ無かった。

同じ期間に PR で落ちた CI は15回で、11回は1本の人の PR、ループの4回は lint・型・unit テストの失敗だった。Browser は PR で14回落ち、調べた5回のうち4回は PR の画面の変更と既存の配置の検査が食い違ったもの（PR の中で直して通した）、1回は依存更新の PR の時間切れだった。develop への push の Browser は1回落ち、CI は落ちなかった。PR で browser を止めずに develop で初めて落ちると、develop が赤の間は build・polish が起きない（ループ開発の precheck）。

develop の Rulesets は PR と5つの必須チェック（lint / test / browser / build / smoke）を求め、承認は0人、最新の develop に追いつく必要はない。admin の bypass は PR のマージでだけ効き、直接 push はできない。リポジトリは auto-merge を許可している。オーナーは 2026-11-27、エージェントによる開発を速くするために PR の CI を減らすこと、仕組みや前提ごと変えてよいことを求めた。

## Decision

ループの周回は必須チェックの完了を待たない。作った context と別のレビューで直すべき指摘が0になったら、auto-merge（squash）を予約して周回を終える。必須チェックがすべて成功したら GitHub がマージする。必須チェックが落ちたか develop と競合した PR は、15分動きが無ければ「止まっている PR」として次の build がすぐ拾い、新しい Issue より先に直す。CI 待ちが周回から外れ、そのぶん次の周回が早く始まる。必須チェックがマージを止める点は変わらないので、develop は緑のまま保たれる。

PR の必須チェックの中身は減らさず、律速の test と browser を分割して並列に回す。unit は2つ、browser は3つに分け、必須チェックの名前の集約ジョブが全部の成功を報告する。集約ジョブは分割が落ちても飛んでも必ず走り、成功以外を失敗にする。必須チェックの名前と Rulesets は変えないので、人の PR の流れ（PR・必須チェック・PR Preview・マージ通知）はそのまま使える。

develop は PR 必須のままにする。auto-merge で周回は CI を待たなくなり、直接 push にしても周回は速くならない。一方で、必須チェックによる develop の保護、PR に紐づくリリースの説明とマージ通知、人とループが同じ流れで変更を追えることを失う。

### 本ADRで決定しないこと

分割の数とジョブの書き方は CI と Browser の workflow と、それを確かめる workflow のテストへ委譲する。止まっている PR の判定は判定スクリプト（precheck）へ、周回の手順は build の指示書へ、マージの決まりはループ開発の文書へ委譲する。検査ごとの回すタイミングは ADR 0030 とテスト方針のまま変えない。委譲先へのリンクは References に置く。

## Consequences

- 良い影響：周回から CI 待ち（中央値約16分のうち、レビューと重ならない分）が外れる。必須チェックの所要時間は、律速の browser を3つに分けることで短くなり、auto-merge が早く効く。
- 良い影響：必須チェックとその名前は変わらないので、develop が赤になりやすくはならない。人の PR も同じ速さで返る。
- 悪い影響：落ちた PR を直すのは、作った周回ではなく次の build になる。作った context の記憶は使えず、PR 本文とログから読み直す。15分は、レビュー中の周回の push と取り合わないための待ちで、そのぶん直し始めが遅れる。
- 悪い影響：分割で runner の使用数が増える（CI は 4 から 6 ジョブ、Browser は 1 から 4 ジョブ）。公開リポジトリのため費用は増えないが、同時に動く PR が増えると起動待ちが出うる。分割ごとに依存のインストールと Storybook の build を繰り返す。
- 悪い影響：auto-merge を予約した PR は、マージまでループの open PR に数えるので、上限（2本）に早く当たることがある。
- 中立：PR で回す検査と、develop・リリース前で回す検査は ADR 0030 から変えていない。browser の PR での失敗の多くは、画面の変更と配置の検査の食い違いで、develop へ移すと develop の赤に変わるだけなので、PR に残した。
- 保証しない範囲：auto-merge は必須チェックしか見ない。PR Preview・Chromatic・CodeRabbit の失敗ではマージは止まらない。レビューで直すべき指摘が0になる前に予約しないことは、指示書でだけ担保する。
- 見直す条件：
  - 分割しても必須チェックが5分を超える、または起動待ちが目立つとき。分割の数か、PR で回す範囲を見直す。
  - auto-merge でマージされた PR が develop を赤にすることが続くとき。
  - 落ちた PR が止まっている PR として拾われず、1時間以上残ることが続くとき。

## Alternatives Considered

- ループだけ develop へ直接 push する（kobe-student-hub の方式）：Rulesets の bypass を push まで広げる必要がある。auto-merge で周回は CI を待たなくなるため、速さの差はマージが数分早まるだけで、develop の保護・PR に紐づく記録・人と同じ流れを失う。採らない。
- browser（と smoke）を必須チェックから外し、develop への push とリリース前だけで回す：PR での browser の失敗の多くは、マージ前に PR の中で直せていた食い違いで、develop へ移すと develop の赤になり、mend が直すまで build・polish が止まる。周回は auto-merge で browser を待たなくなるので、外して得る速さも小さい。採らない。smoke は PR ではジョブごと skipped で待ち時間が無いため、Rulesets は変えない。
- PR では lint・型だけを回し、テストはリリース前のゲートだけにする：落ちた原因の PR が分からなくなり、列車が止まる。採らない。
- 周回が必須チェックを待ち続け、分割だけで速くする：分割しても CI 待ちは周回に残る。採らない。
- Browser の `labeled` での再実行を絞る：同じ commit での取り消しは77回あったが、取り消しまでの平均は約16秒で、待ち時間への影響は小さかった。変えない。

## Related ADRs

- ADR 0030：CI はリリース時の致命的な不具合を止める基準とし、PR では変更範囲で検査を絞る。検査の配置はそのままで、本 ADR は PR の必須チェックの回し方と、ループの待ち方を変える。
- ADR 0031：ループで改善から公開までを回す。develop へのマージは PR と必須チェックを通す判断を残し、周回がマージを待つかどうかだけを本 ADR で変える。

## References

- 委譲先：[ci.yml](../../.github/workflows/ci.yml)、[browser.yml](../../.github/workflows/browser.yml)、[workflow のテスト](../../.github/scripts/ci-timing-workflow.spec.ts)、[precheck](../../scripts/loop/precheck.mts)、[build の指示書](../loop/prompts/build.md)、[ループ開発](../loop/README.md#マージの決まり)、[テスト方針](../development/testing.md#ci-で回すタイミング)。
- 実測（2026-11-27 確認）：`loop` ラベルでマージされた直近43本の PR（2026-11-25〜27、人が作った PR と長く開いていた PR を除く）の作成・マージ時刻と最後の commit のチェックの所要時間、そのうち実行記録が残る18本の全 push の CI・Browser の実行時間、2026-11-25 13:00 UTC 以降の CI・Browser の全実行（PR と develop への push）の結論と失敗ログ、ジョブ・ステップごとの所要時間。
- 2026-11-27 確認：develop の Rulesets（PR 必須、必須チェック5つ、承認0人、`strict_required_status_checks_policy` は false、Admin の bypass は `pull_request`）、リポジトリの auto-merge の許可。
- 2026-11-27：オーナーが、AI エージェントの開発を速くするために PR の CI を減らすこと、前提や仕組みを変えてよいこと、本番に致命的な不具合を出さないこと、壊れたら mend が直す前提で速さを優先してよいことを示した。
- 判断の根拠：auto-merge で周回を抜けること、分割、直接 push と browser の移動を採らないことは、上の実測をもとにした AI の判断。

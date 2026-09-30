# 0001: Cloudflare構成でRoomDOを共有状態の権威にする

- 状態：採用（既存判断の整理）
- 決定日：不明。2026-07-07の実装履歴で採用を確認
- 記録日：2026-09-30

## 背景

フェーズ進行・個人用付箋・ステルス投票を、参加者ごとの可視性を守りながら同期する。ルームが自然な状態・処理の単位となる。当時の技術比較では、放置後の復帰とドラッグ配信を含む利用形態、コスト、運用の継続性を評価した。

## 候補と決定

Supabase + Vercelの継続などと比較し、Cloudflare Workers + Durable Objects + D1を採用した。1ルームの共有状態と操作の認可・配信はRoomDOが持つ。D1はルーム横断のディレクトリや投影を扱い、ルーム内の第二の権威にしない。

比較案に含まれたReact SPA・Clerkは採用せず、Next.jsをOpenNextで配信し、Google OIDCとHS256 JWT Cookieを使う。ブラウザから特権的なデータアクセスを行わず、api-workerをD1 / RoomDOへの入口にする。

## 影響と見直す条件

ルーム内の操作と配信を一つの権威に集められる。一方、Durable Objects固有の実行・永続化・テストに依存し、D1の横断表示への投影では失敗・再試行・期限を別に扱う必要がある。単一スレッドだけで非同期処理の競合がすべて消えるわけではなく、状態更新にはtransactionや操作IDも使う。

ルーム単位では収まらない共有範囲や、実測した性能・運用の制約が要求を満たさなくなった場合に見直す。当時の価格試算を現在の価格として扱わない。

## 根拠

- [当時の技術比較](../site/stack-reeval/index.html)（採用しなかった案も含む）
- 採用を確認できるcommit：[6b695dc](https://github.com/engineer-first/idea-boost/commit/6b695dc)、[eb0392f](https://github.com/engineer-first/idea-boost/commit/eb0392f)
- [現在の構成と責務](../architecture/overview.md)、[RoomDO](../../workers/room/room-do.ts)、[API設定](../../workers/wrangler.jsonc)

このADRは既存資料と実装の整理であり、新たな構成変更の決定ではない。

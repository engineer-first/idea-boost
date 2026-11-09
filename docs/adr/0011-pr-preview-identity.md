---
id: "0011"
status: Superseded by ADR 0012
date: "2026-10-10"
---

# ADR 0011: PR PreviewをAccess本人ログインと共通APIで動かす

## Context

レビュー担当者はローカル起動せずにPRの画面を好きなステップから操作し、実際の本人同士で同じルームを共有する必要があった。初版は本番データを使わず、PRごとのAPIと保存先の複製運用を避ける前提だった。

## Decision

PRごとの画面を公開し、共通の検証用APIと専用保存先へ接続する案を提案した。入口ではCloudflare Accessで許可されたGoogle本人を確認し、アプリのルーム認可は維持する。本番と検証環境の認証を分け、初版の公開・削除対象を抑えるためである。

### 本ADRで決定しないこと

関数・通信形式・保存の具体手順と移行方法は、PR Preview運用へ委譲する。参照先はReferencesに示す。

## Consequences

良い影響は、本人の共同操作を保ちながらPRごとの公開対象を減らせること。悪い影響は、APIや保存処理を変えるPRでも共通APIの動作しか確認できないこと。中立の影響として、Access設定とアプリの許可範囲の両方を管理する必要がある。実際にPRの画面とAPIが一致せず変更を確認できなかったため、後継ではPR全体と保存先を分離する。

2026-11-03に実コード・一次資料を照合。旧提案の個別の採用承認は根拠未確認。後継本文は新しい提案として別に評価する。現コードは共通API案から後継のPR全体分離方式へ変わっている。

## Alternatives Considered

各PRで通常のGoogle OAuthを使う案では可変URLの戻り先管理が増える。API・保存先もPRごとに作る案は初版では運用対象が増えるとして見送ったが、後継でこの判断を変更する。

## Related ADRs

- [ADR 0012](0012-pr-preview-full-stack.md)：関連する判断。

## Supersession

[ADR 0012](0012-pr-preview-full-stack.md)がこの提案を置き換える。後継もProposedであり、後継の採用を示すものではない。

## References

- [PBI #362](https://github.com/engineer-first/idea-boost/issues/362)
- [Preview運用](../operations/preview.md)
- [照合した実装・規約](../../workers/preview-gateway.ts)（確認日：2026-11-03）。
- セッション調査：2026-11-03にvaultのClaude/Codexとローカルの元セッションを検索したが、この判断の本人の採用発言は未確認。GitHub記録の投稿者名だけで本人の承認とは判定していない。
- [書き直し前の記録と詳細](https://github.com/engineer-first/idea-boost/blob/ac5e7b56/docs/adr/0011-pr-preview-identity.md)。実装詳細の正本は上記の仕様・運用文書または実装PRを参照する。

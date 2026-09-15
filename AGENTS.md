# エージェント指示

- このファイルをエージェント運用ルールの真実として扱う
  （`CLAUDE.md` は本ファイルへの symlink）。
- 指示は短く、最新に保ち、重複させない。静的検査で強制できるルールは
  ここに書かず、biome / ast-grep（`rules/ast-grep/`）に追加する。
- 公開境界では明示的な型を優先する。
- コンパイラ、lint、テスト設定を緩めて通そうとしない。
- コードレビューのコメント、説明、提案、要約は日本語で書く。
- 振る舞いを変更するときは TDD に従う。
- テストは Vitest を使う。Worker / Durable Object のテストは
  `@cloudflare/vitest-pool-workers`（`npm run test:workers`）で行う。
- Next.js の作業では、実装前に `node_modules/next/dist/docs/` の関連ガイドを読む。
- プロダクト要求の真実は [`docs/prd.md`](docs/prd.md)。

## リポジトリ構成

- `app/` — Next.js への「殻」。予約ファイル（`page.tsx` / `layout.tsx` /
  `route.ts`）と 1 ルート専用の組み立て view のみ。`page.tsx` は認証・params
  解決・データ取得の配線に徹し、資産は `features/` に置く。
  `app/mocks/` に MSW ハンドラ（開発・テスト用インフラ）。
- `features/` — ドメイン UI の唯一の置き場。機能（ユーザーに見える能力）単位。
  各 feature の公開境界は `index.ts`（外から使えるのはそこに並ぶものだけ）。
  現在: `room`（ルーム内体験）、`notes`（付箋）、`room-members`、`dot-vote`、
  `vote-totaling`、`invite`、`room-lifecycle`（作成・参加）、`auth`。
- `components/ui/` — shadcn 汎用部品のみ。ドメイン（contracts / features /
  app）を知らないことがこの層の価値。`components/schema-diagrams/` は
  Storybook 専用ドキュメント部品。
- `contracts/` — 境界スキーマ（zod）。WS プロトコル・REST・セッション・ボード定数。
  クライアントとサーバーの両方がここを import する。実装より先にここを変える。
  `*.fixture.ts` はスキーマ準拠のテストデータビルダー
  （テスト・stories 専用。本番コードからは import しない）。
- `workers/` — Cloudflare Workers 側。`api-worker.ts`（D1 + RoomDO への唯一の入口）、
  `room/`（1ルーム = 1 Durable Object の権威サーバー。`room-do.ts` が
  エントリポイントの façade で、ドメインロジックは同ディレクトリの
  モジュールに分割）、`migrations/`（D1）。
- `lib/` — ドメイン非依存インフラ。React コンポーネントを置かない。
  `api-client.ts`（Next サーバーから api-worker を呼ぶ唯一のクライアント）、
  `session/`（HS256 JWT Cookie の発行・検証）、`room-client/`（ルーム
  WebSocket クライアント。自動再接続つき）、`throttle.ts`、`notify.ts`
  （文言を持たない汎用 toast。ドメイン文言は各 feature の notify に置く）。
- `rules/ast-grep/` — レイヤー間 import 境界の機械検査ルール。

### 依存の一方通行ルール

矢印は「import してよい方向」。違反は ast-grep が CI（`lint:boundaries`）で
機械検査する。詳細・理由は `rules/ast-grep/*.yml` のコメントが真実。

```
app  →  features  →  components/ui・lib  →  contracts
```

- feature 間は `index.ts`（公開境界）経由のみ。同一 feature 内は相対 import。
  許可エッジの一覧は `rules/ast-grep/feature-dependencies-one-way.yml` が真実。
  エッジを増やすときは、循環にならないことを確認してそこを更新する。
- `app/` 配下を import してよいのは `app/` 配下だけ。2 ルート以上から
  使われるようになったら features へ昇格する。

## 命名規則

| 対象                  | 規則                             | 例                                  |
| --------------------- | -------------------------------- | ----------------------------------- |
| ファイル名            | `kebab-case`                     | `idea-card.tsx`, `use-idea-list.ts` |
| テスト / ストーリー   | `*.spec.ts(x)` / `*.stories.tsx` | `note-card.spec.tsx`                |
| 関数名                | `camelCase`                      | `getUserName`                       |
| スキーマ名（型・zod） | `PascalCase`                     | `User`, `Idea`, `IdeaStatus`        |

- Next.js の予約ファイル名は App Router の規約に従う。
- 例: `page.tsx`、`layout.tsx`、`route.ts`、`loading.tsx`、`error.tsx`。
- feature 内は 5 箱まで: `containers / templates / organisms / molecules`
  （JSX を返すもの）と `logic`（hook・reducer・Server Action・純関数・定数）。
  依存方向は ast-grep `feature-band-imports.yml` が機械検査する（規則・理由は
  そのコメントが真実）。新規コンポーネントの既定は最下帯（`molecules/`）。上の
  帯の部品が必要になったら CI が昇格を教える。atoms は作らない（リポジトリ
  全体の atoms は `components/ui/`）。
- feature 単位で「フラット or 5 箱」の二択。混在・規約外ディレクトリ・箱の
  入れ子は `npm run check:feature-layout`（CI）が fail させる。
  spec / stories / fixture は実装と同居させる。
- 役割の細分はファイル名のサフィックスで表現する
  （`-view`, `-card`, `-dialog`, `-section`, `use-`）。背景: feature 内 5 箱は
  [`docs/feature-internal-structure.md`](docs/feature-internal-structure.md)、
  feature 縦割りは [`docs/feature-structure.md`](docs/feature-structure.md)。
- コンテナと view はステムを揃える（例: `room-board.tsx` と
  `room-board-view.tsx`）。

## 開発プロセス（TDD）

- 振る舞いの変更は、原則として失敗する Vitest テストから始める。
- 実装前に failing test を確認する。
- サイクルは「失敗するテスト -> 実装 -> リファクタリング」で進める。
- 実装後に同じテストが green になることを確認する。
- テストは観測可能な振る舞いに集中させる。
- 変更が小さく見えてもテストを省略しない。
- 失敗するテストが存在する前に本番コードを変更しない。
- リファクタリングはテストが green になってから行う。

## フロントエンドと UI（Storybook + MSW）

- container / view 分離を必須にする。view は「props in、コールバック out」だけ。
  view の判定器は「Storybook に単体で載せられるか」。
- container が肥大したら関心ごとの hook（`use-*`）に分割し、container は
  hooks を束ねて view に渡すだけにする（例: `features/room/logic/use-*.ts`）。
  楽観更新の可否のようなポリシーは hook 単位で spec を書く。
- 状態は「純関数 reducer + サーバー権威（RoomDO）」を維持する。グローバル
  ストア（Zustand / Redux 等）は導入しない。RoomDO と並ぶ第二の真実が生まれ、
  同期バグの温床になる。クライアントの状態は「サーバー真実の畳み込み・URL・
  コンポーネントローカル UI 状態」の 3 種で全て。
- すべての UI コンポーネントに `*.stories.tsx` を作成し、
  Storybook を通じて component-driven に構築する。stories のタイトル階層は
  features/ をミラーする（例: `Notes/NoteCard`、`DotVote/DotVoteButton`）。
- 外部 API 通信は MSW（`app/mocks/`）でモックする。WebSocket はフェイクの注入
  （`webSocketFactory`）でモックする。
- コンポーネント内に生のテストデータをハードコードしない。fixture、handler、
  builder、ガイド文言などの固定コンテンツはコンポーネントファイルの外に置く。
  contracts 型のビルダーは `contracts/*.fixture.ts` に集約し、feature 固有の
  fixture はコンポーネントと同居させる。
- UI がデータに依存する場合は loading、empty、success、error 状態をテストする。

## API とサーバー処理（api-worker / Server Action / Route Handler）

- データ（D1・RoomDO）への到達は必ず `workers/api-worker.ts` を経由する。
  Next 側から D1 や DO を直接触らない。
- API 境界で入力を検証する（コントラクトは `contracts/` の zod スキーマ）。
- API 境界で認可を強制する。認証が必要な箇所は毎回 `getCurrentUser()` /
  `getSessionFromRequest()` を通す（Proxy には頼らない。Next 公式の推奨）。
- API レスポンスは型付けし、最小限に保つ。

## リアルタイムとセキュリティ（Durable Objects）

- ルーム内で共有される状態（メンバー・付箋・フェーズ進行・投票・
  グルーピングなど）の真実は RoomDO だけが持つ。D1 の rooms 行は
  「招待コード -> ルーム解決」のディレクトリにすぎない。
- ノートの可視性判定は `workers/visibility.ts` の `visibleTo()` に一点集約する。
  ノートのスナップショットと配信は必ずこの関数を経由する。メンバー・フェーズ
  進行は全員共有が明示的に設計された情報として全員へ配信する
  （`member_joined` / `member_left` は本人除外）。それ以外の新しい情報は既定で
  受信者ごとの可視性判定を経由させ、全員配信に乗せるのは全員共有が明示的に
  設計された情報だけにする。
- 可視性・認可のルールを変えたら、`visibility.spec.ts` のテーブルと
  `workers/*.spec.ts` の否定系テストを必ず更新する。否定系
  （非メンバー・非author・未認証が「できない」こと）を先に書く。
- クライアントに書き換えさせたくないフィールド（authorId / roomId など）は、
  プロトコルのメッセージに含めない。認可チェックではなく形で塞ぐ。
- D1 migration は意図として戻せる形にし、スコープを最小限に保つ。
  適用は `npm run db:migrate`（ローカル）。
- RoomDO migration: develop にマージ済みの `.sql` は変更・削除せず、修正は
  新しい migration で行う（`schema_migrations` は ID しか記録しないため、
  適用済み ID の内容を変えても再実行されず、DO 間でスキーマが黙って分岐する。
  CI が `check:room-do-migrations:immutable` で機械検査する）。
  未マージの自分の `.sql` は自由に編集・整理してよい。内容を変えるときは
  ファイル名の秒（= ID）もずらすと、適用済みのローカル DO が fail-closed で
  落ちて気づける。新規作成は `npm run new:room-do-migration -- 短い説明`。
  集約 `index.ts` は gitignore 済みの生成物（`npm ci`・`test:workers`・
  `dev:api` などが自動再生成する）。コミットするのは `.sql` だけ。
- D1 migration または `workers/room-do-migrations/`（RoomDO の `.sql`）を変更
  すると、Storybook の
  `Schema/SchemaDiagram`（ER 図）と `Schema/SchemaDetails`（カラム・
  インデックス・制約の一覧。いずれも `components/schema-diagrams/`）に自動反映
  される（`npm run storybook` / `build-storybook` が `tbls` で再生成する）。
  Chromatic が develop との見た目の差分を検出するため、手動生成やコミットは
  不要。D1 と RoomDO は物理的に別ストレージで DB レベルの結合を持たないため、
  ER 図もあえて分離している（1枚に混ぜて結合があるように見せない）。
- スキーマの構造ルール（FK インデックス必須・カラム数上限など）は
  `.tbls/*.yml` の `lint` に書き、`npm run db:schema:lint`（CI でも実行）で
  機械検査する。

## 境界ルール

- UI、Server Actions、api-worker、RoomDO の境界を常に意識する。
- ブラウザコードにセッション秘密鍵や特権的なデータアクセスを含めない。
- 境界を流れるデータの形は `contracts/` が真実。実装層は再生成可能に保つ。

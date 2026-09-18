# 作業別エージェントルール

[AGENTS.md](../AGENTS.md) の表で該当する節を、変更前に読む。
複数の境界にまたがる作業では各節を併用する。

## コード配置と命名

| 場所             | 責務                                                                                                                                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`           | Next.js の予約ファイルと 1 ルート専用の組み立て view。`page.tsx` は認証・params 解決・データ取得の配線に徹する。2 ルート以上で使う資産は `features/` へ昇格する。`app/mocks/` は MSW 用。                                                                                                           |
| `features/`      | ユーザーに見える機能単位のドメイン UI。外部向け公開境界は `index.ts`。                                                                                                                                                                                                                              |
| `components/ui/` | ドメインを知らない shadcn 汎用部品。`components/schema-diagrams/` は Storybook 専用ドキュメント部品。                                                                                                                                                                                               |
| `contracts/`     | クライアント・サーバー共通の zod 境界スキーマ（WS・REST・セッション・ボード定数）。`*.fixture.ts` はスキーマ準拠のビルダーで、テスト・stories 専用。本番から import しない。                                                                                                                        |
| `workers/`       | `api-worker.ts` が D1 / RoomDO への唯一の入口。`room/room-do.ts` は 1 ルーム = 1 DO の façade、ドメインロジックは同ディレクトリのモジュールに分割。`migrations/` は D1。                                                                                                                            |
| `lib/`           | ドメイン非依存インフラ。React コンポーネントを置かない。`api-client.ts` は Next サーバーから api-worker への唯一のクライアント。`session/` は HS256 JWT Cookie、`room-client/` は自動再接続付き WS、`throttle.ts` は汎用処理。`notify.ts` は文言を持たず、ドメイン文言は feature の notify に置く。 |

依存方向の概略は `app → features → components/ui・lib → contracts`。
細則・理由・許可エッジは [ast-grep ルール](../rules/ast-grep/) が正本
（`npm run lint:boundaries`）。feature 間は公開境界経由、同一 feature 内は相対 import。
依存エッジを増やすときは循環がないことを確認し、
[feature-dependencies-one-way.yml](../rules/ast-grep/feature-dependencies-one-way.yml) を更新する。
`app/` を import できるのは `app/` だけ。

- ファイルは `kebab-case`、関数は `camelCase`、型・zod スキーマは `PascalCase`。
  テストは `*.spec.ts(x)`、stories は `*.stories.tsx`。
  Next.js の予約ファイルは App Router の規約に従う。
- feature の配置は「フラット or 5 箱」。5 箱の UI は
  `containers / templates / organisms / molecules`、hook・reducer・Server Action・
  純関数・定数は `logic`。新規 UI の既定は `molecules/` とし、上帯の部品が必要なら昇格する。
  `atoms` は作らない（汎用部品は `components/ui/`）。
- 配置・混在・入れ子は `npm run check:feature-layout`、帯の依存は
  [feature-band-imports.yml](../rules/ast-grep/feature-band-imports.yml) で検査する。
  背景は [feature 構造](feature-structure.md) と [feature 内部構造](feature-internal-structure.md)。
- spec / stories / fixture は実装と同居させる。役割は `-view`、`-card`、`-dialog`、
  `-section`、`use-` 等のファイル名で表す。container と view はステムを揃える
  （`room-board.tsx` / `room-board-view.tsx`）。

## UI

- container / view を分離する。view は props を受け取り callback を返すだけとし、
  Storybook に単体で載せられることを基準にする。
- container が肥大したら関心ごとの `use-*` hook に分割し、container は束ねて view に渡す。
  楽観更新の可否などのポリシーは hook 単位で spec を書く。
- 状態は純関数 reducer と RoomDO のサーバー権威を維持する。
  クライアント状態はサーバー真実の畳み込み・URL・コンポーネントローカル UI 状態の 3 種。
  第二の真実を作るグローバルストア（Zustand / Redux 等）は導入しない。
- すべての UI コンポーネントに stories を作り、Storybook を通じて構築する。
  タイトル階層は features をミラーする（`Notes/NoteCard` 等）。
- 外部 API は MSW（`app/mocks/`）、WS は `webSocketFactory` へのフェイク注入でモックする。
- 生のテストデータをコンポーネント内にハードコードしない。fixture・handler・builder・
  ガイド文言等の固定コンテンツはファイルの外へ置く。
  contracts 型のビルダーは `contracts/*.fixture.ts`、feature 固有の fixture は実装と同居。
- データに依存する UI は loading / empty / success / error をテストする。

## API

- D1 / RoomDO へのアクセスは必ず `workers/api-worker.ts` を経由し、Next から直接触らない。
- API 境界で `contracts/` の zod スキーマによる入力検証と認可を強制する。
  認証が必要な箇所は毎回 `getCurrentUser()` / `getSessionFromRequest()` を通し、Proxy に頼らない。
- API レスポンスは型付けし、最小限にする。認可変更には次節も適用する。

## 共有状態と認可

- メンバー・付箋・フェーズ・投票・グルーピング等の共有状態は RoomDO だけが持つ。
  D1 の `rooms` 行は招待コードからルームを解決するディレクトリにすぎない。
- ノートのスナップショットと配信は必ず
  [workers/visibility.ts](../workers/visibility.ts) の `visibleTo()` を経由する。
  メンバー・フェーズ進行は明示的な全員共有情報として配信する
  （`member_joined` / `member_left` は本人除外）。
  その他の新しい情報は既定で受信者ごとの可視性判定を経由し、
  全員配信は全員共有が明示的に設計された情報だけにする。
- 可視性・認可ルールの変更では、非メンバー・非 author・未認証が「できない」否定系を先に書く。
  [workers/visibility.spec.ts](../workers/visibility.spec.ts) のテーブルと
  `workers/` の関連する `*.spec.ts` の否定系を必ず更新する。
- `authorId` / `roomId` 等、クライアントに書き換えさせたくないフィールドを
  クライアントが送るプロトコルメッセージに含めない。認可チェックだけに頼らず形で塞ぐ。

## Migration

- D1 migration は意図として戻せる形にし、スコープを最小限にする。
  ローカル適用は `npm run db:migrate`。
- RoomDO の develop にマージ済み `.sql` は変更・削除しない。修正は新規 migration にする。
  適用履歴は ID しか記録せず、同じ ID の変更は再適用されず DO 間でスキーマが分岐するため。
  CI の `check:room-do-migrations:immutable` が不変性を検査する。
- 未マージの自分の RoomDO `.sql` は編集・整理してよい。内容変更時にファイル名の秒（ID）も
  ずらすと、適用済みのローカル DO が fail-closed で停止して変更に気づける。
  新規作成は `npm run new:room-do-migration -- 短い説明`。
- `workers/room-do-migrations/index.ts` は gitignore 済みの生成物。
  `npm ci` / `test:workers` / `dev:api` 等が再生成するため、migration は `.sql` だけコミットする。
- D1 / RoomDO の `.sql` 変更は `npm run storybook` / `npm run build-storybook` により tbls で
  `Schema/SchemaDiagram`（ER 図）と `Schema/SchemaDetails`（カラム・インデックス・制約）に
  自動反映される。Chromatic が develop との差分を検出し、手動生成・コミットは不要。
  両 DB は別ストレージで DB レベルの結合を持たないため、ER 図も分離する。
- FK インデックス・カラム数等の構造ルールは [.tbls/](../.tbls/) の `lint` に追加し、
  `npm run db:schema:lint`（CI でも実行）で検査する。

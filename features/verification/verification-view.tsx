import { Button } from "@/components/ui/button";
import { getRoomPhaseLabel } from "@/contracts/phase";
import {
  VERIFICATION_CHECKPOINTS,
  type VerificationActive,
  type VerificationCheckpoint,
  type VerificationStatus,
} from "@/contracts/verification";
import { DEV_USERS } from "@/lib/session/dev-users";
import { VERIFICATION_DESCRIPTIONS } from "./verification-copy";

export type VerificationViewProps = {
  active: VerificationActive | null;
  status: VerificationStatus | null;
  pending: boolean;
  error: string | null;
  isOwner: boolean;
  onCreate: (checkpoint: VerificationCheckpoint) => void;
  onVote: () => void;
  onRetry: () => void;
};
export function VerificationView({
  active,
  status,
  pending,
  error,
  isOwner,
  onCreate,
  onVote,
  onRetry,
}: VerificationViewProps) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
      <div className="mx-auto max-w-5xl space-y-7 px-6 py-8">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Idea Boost / 開発用
          </p>
          <h1 className="text-3xl font-bold">検証する状態を選ぶ</h1>
          <p className="text-muted-foreground">
            ステップを押すと、付箋付きの新しいルームを準備します。追従中のボードは、別ブラウザも含めて切り替わります。
          </p>
        </header>
        <section
          aria-label="現在の検証"
          className="space-y-3 rounded-xl border bg-background p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="font-semibold">
              {pending
                ? "検証状態を準備中…"
                : active
                  ? `検証中：${status ? getRoomPhaseLabel(status.phase) : active.checkpoint}`
                  : "まだ検証ルームがありません。ステップを選んでください。"}
            </p>
            <Button asChild>
              <a
                href="/dev/verify/board"
                target="idea-boost-verification"
                rel="opener"
              >
                検証ボードを開く
              </a>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            ボードに検証用の操作UIは表示しません。作り直す前のルームは残ります。
          </p>
          {active && (
            <div className="flex flex-wrap gap-4 text-sm">
              <a
                className="underline"
                href={`/rooms/${active.roomId}`}
                target="_blank"
                rel="noreferrer"
              >
                このルームを固定して開く（追従なし）
              </a>
              <span>招待コード：{active.inviteCode}</span>
            </div>
          )}
          {isOwner && status?.canCompleteVotes && (
            <div className="flex items-center gap-3">
              <Button variant="outline" disabled={pending} onClick={onVote}>
                他2人の投票を完了する
              </Button>
              <span className="text-sm text-muted-foreground">
                他参加者 {status.completedOtherVoters}/2人完了
              </span>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 text-sm text-destructive"
            >
              {error}
              <Button variant="outline" disabled={pending} onClick={onRetry}>
                再取得
              </Button>
            </div>
          )}
        </section>
        {isOwner ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((phase) => (
              <section key={phase} className="space-y-3">
                <h2 className="font-semibold">
                  {phase === 1
                    ? "1 課題整理"
                    : phase === 2
                      ? "2 HMW"
                      : "3 アイデア"}
                </h2>
                {VERIFICATION_CHECKPOINTS.filter(
                  (item) =>
                    item.phase.kind === "step" && item.phase.phase === phase,
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={pending}
                    onClick={() => onCreate(item.id)}
                    className="w-full cursor-pointer rounded-xl border bg-background p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-50"
                  >
                    <span className="block text-sm font-semibold">
                      {item.label}
                    </span>
                    <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                      {VERIFICATION_DESCRIPTIONS[item.id]}
                    </span>
                  </button>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <p>
            状態の切り替えはOwnerで操作してください。このアカウントでは検証ボードを開けます。
          </p>
        )}
        {isOwner && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onCreate("lobby")}
          >
            開始待ちを準備する
          </Button>
        )}
        <section className="space-y-2 border-t pt-5 text-sm text-muted-foreground">
          <h2 className="font-medium text-foreground">
            別ブラウザでも同じ検証に参加
          </h2>
          <p>
            下のアカウントでログインし、各ブラウザで /dev/verify/board
            を開いてください。Ownerを複数タブで開くこともできます。Viewerも通常の参加者です。
          </p>
          <p>
            {DEV_USERS.map((user) => user.email).join(" / ")}
            （共通パスワード：password）
          </p>
          <p>
            グループ数、採用・取消、タイマーなどの細かな状態は、ボードの通常操作で調整できます。
          </p>
        </section>
      </div>
    </main>
  );
}

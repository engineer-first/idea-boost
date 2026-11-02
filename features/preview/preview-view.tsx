import { Button } from "@/components/ui/button";
import {
  PREVIEW_SIGNED_OUT_PATH,
  type PreviewCheckpoint,
  PreviewCheckpointSchema,
} from "@/contracts/preview";
import { VERIFICATION_CHECKPOINTS } from "@/contracts/verification";

export type PreviewViewProps = {
  pending: boolean;
  error: string | null;
  onCreate: (checkpoint: PreviewCheckpoint) => void;
};
export function PreviewView({ pending, error, onCreate }: PreviewViewProps) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold">確認するステップを選ぶ</h1>
          <p className="max-w-2xl text-muted-foreground">
            ステップを選ぶと、あなたがホストのサンプル入りルームを作ります。ボードの「招待」からURLを渡すと、メンバーも同じPRの同じルームで操作できます。
          </p>
          <a
            href="/home"
            className="inline-block text-sm underline underline-offset-4"
          >
            最初から作成・参加する
          </a>
        </header>
        {pending && <p role="status">新しいルームを準備しています…</p>}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {[1, 2, 3].map((phase) => (
          <section
            key={phase}
            aria-label={`フェーズ${phase}`}
            className="space-y-3"
          >
            <h2 className="text-lg font-semibold">
              {phase === 1
                ? "課題を整理する"
                : phase === 2
                  ? "問いをつくる"
                  : "アイデアを育てる"}
            </h2>
            <div className="flex flex-wrap gap-3">
              {VERIFICATION_CHECKPOINTS.filter(
                (c) =>
                  c.phase.kind === "step" &&
                  c.phase.phase === phase &&
                  PreviewCheckpointSchema.safeParse(c.id).success,
              ).map((c) => (
                <Button
                  key={c.id}
                  variant="outline"
                  disabled={pending}
                  onClick={() => onCreate(PreviewCheckpointSchema.parse(c.id))}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </section>
        ))}
        <section aria-label="LPを確認する" className="space-y-3">
          <h2 className="text-lg font-semibold">LPを確認する</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            未ログイン表示では、このブラウザでアプリのログインがない状態として表示します。ログイン画面の「Googleではじめる」か、この画面を開くと元のログイン状態に戻ります。
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a
              href={PREVIEW_SIGNED_OUT_PATH}
              className="underline underline-offset-4"
            >
              未ログインでトップを開く
            </a>
            <a href="/about" className="underline underline-offset-4">
              ログイン済みで説明ページを開く
            </a>
          </div>
        </section>
        <p className="max-w-2xl text-sm text-muted-foreground">
          参加者のマイ付箋は空から始まります。各自で付箋を追加できます。選び直すと別のルームを作り、開いているルームは切り替わりません。
        </p>
      </div>
    </main>
  );
}

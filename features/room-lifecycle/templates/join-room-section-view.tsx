// ホーム「ルームに参加」セクションの表示専用。
// 見出しカード + 招待コード入力フォーム + 確認 Dialog。
// 入力・確認 Dialog・pending 文言はすべて props で固定する（Storybook / テスト用）。
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type JoinRoomSectionViewProps = {
  code: string;
  onCodeChange: (code: string) => void;
  onCodeBlur?: () => void;
  codeError?: string;
  // lookup 中（「確認中…」）。
  lookingUp?: boolean;
  // join 確定処理中（「参加中…」）。
  joining?: boolean;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  // 確認 Dialog のホスト名（空ならフォールバック文言）。
  hostName: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onConfirm: () => void;
};

export function JoinRoomSectionView({
  code,
  onCodeChange,
  onCodeBlur,
  codeError,
  lookingUp = false,
  joining = false,
  dialogOpen,
  onDialogOpenChange,
  hostName,
  onSubmit,
  onConfirm,
}: JoinRoomSectionViewProps) {
  const isValidCode = /^[A-Z0-9]{6}$/.test(code);

  return (
    <Card
      className="flex h-full flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md"
      data-testid="home-join-room"
    >
      <CardHeader className="gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <LogIn className="size-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-base">ルームに参加</CardTitle>
          <CardDescription className="leading-relaxed">
            ホストから共有された 6 桁の招待コードを入力します。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end">
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          data-testid="join-room-form"
        >
          <Field>
            <FieldLabel htmlFor="code">招待コード</FieldLabel>
            <Input
              id="code"
              name="code"
              value={code}
              onChange={(event) =>
                onCodeChange(event.target.value.toUpperCase())
              }
              onBlur={onCodeBlur}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? "invite-code-error" : undefined}
              maxLength={6}
              placeholder="AB12CD"
              autoComplete="off"
              required
              spellCheck={false}
              className="h-11 font-mono text-center text-base tracking-[0.35em] uppercase"
            />
            {codeError ? (
              <FieldError id="invite-code-error" role="alert">
                {codeError}
              </FieldError>
            ) : null}
          </Field>
          <Button
            type="submit"
            variant="outline"
            size="lg"
            disabled={!isValidCode || lookingUp}
            className="w-full"
          >
            {lookingUp ? "確認中…" : "参加する"}
          </Button>
        </form>

        <AlertDialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {hostName
                  ? `${hostName} さんが作成したルームに参加しますか？`
                  : "このルームに参加しますか？"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                招待コード{" "}
                <span className="font-mono font-semibold tracking-wider">
                  {code}
                </span>{" "}
                のルームに参加します。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={joining}>
                キャンセル
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
                disabled={joining}
                data-testid="join-confirm-action"
              >
                {joining ? "参加中…" : "参加する"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

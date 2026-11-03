import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/dialog";
export type ParticipationSwitchViewProps = {
  pending: boolean;
  terminal?: boolean;
  onRetry: () => void;
};
export function ParticipationSwitchView({
  pending,
  terminal,
  onRetry,
}: ParticipationSwitchViewProps) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pending)
      content.current?.querySelector<HTMLElement>("button,a")?.focus();
  }, [pending]);
  return (
    <AlertDialog open>
      <AlertDialogContent
        ref={content}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          content.current?.querySelector<HTMLElement>("button,a")?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending
              ? "ルームに移動しています…"
              : "ルームに移動できませんでした"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pending
              ? "そのままお待ちください。"
              : terminal
                ? "ホームから別のルームを選んでください。"
                : "通信を確認して、もう一度お試しください。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {pending ? (
          <p role="status" className="sr-only">
            移動中です
          </p>
        ) : (
          <AlertDialogFooter>
            {terminal ? (
              <Button asChild>
                <a href="/home">ホームへ戻る</a>
              </Button>
            ) : (
              <Button onClick={onRetry}>もう一度試す</Button>
            )}
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

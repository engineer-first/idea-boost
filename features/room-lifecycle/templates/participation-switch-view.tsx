import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import type {
  ParticipationConfirmation,
  ParticipationResult,
} from "@/contracts/room-participation";
export type ParticipationSwitchViewProps = {
  confirmation?: ParticipationConfirmation;
  failedOperation?: Extract<ParticipationResult, { kind: "rejected" }>;
  pendingTargetName?: string;
  outcomeAccess: "retain" | "discard";
  onOutcomeAccess: (value: "retain" | "discard") => void;
  pending: boolean;
  started: boolean;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onRetry: () => void;
};
export function ParticipationSwitchView({
  confirmation,
  failedOperation,
  pendingTargetName,
  outcomeAccess,
  onOutcomeAccess,
  pending,
  started,
  message,
  onCancel,
  onConfirm,
  onRetry,
}: ParticipationSwitchViewProps) {
  const safeAction = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (failedOperation) safeAction.current?.focus();
  }, [failedOperation]);
  const cannotCancel = confirmation?.progress === "partially_left";
  const disband = confirmation?.sources.some(
    (source) => source.action === "disband",
  );
  const hasLeave = confirmation?.sources.some(
    (source) => source.action !== "disband",
  );
  const verb = confirmation?.target.kind === "create" ? "作成する" : "参加する";
  return (
    <AlertDialog open>
      <AlertDialogContent
        className="max-h-[85dvh] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          if (started || cannotCancel || failedOperation) {
            event.preventDefault();
            safeAction.current?.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {failedOperation
              ? "移動の処理は終了しました"
              : !confirmation
                ? "移動の結果を確認してください"
                : disband
                  ? "ルームを解散して移動しますか？"
                  : "別のルームに移動しますか？"}
          </AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {failedOperation ? (
              failedOperation.error
            ) : (
              <>
                移動先：
                {confirmation?.targetName ??
                  pendingTargetName ??
                  "処理結果を確認しています"}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 text-sm leading-relaxed [overflow-wrap:anywhere]">
          {failedOperation ? (
            <>
              <p>
                この移動の再試行は終了しています。現在の参加状況を確認し、ホームから次のルームを選んでください。
              </p>
              {failedOperation.failure?.exitedSources.map((source) => (
                <p key={source.roomId}>
                  {source.name}：
                  {source.result === "disbanded"
                    ? "解散済み"
                    : source.result === "left"
                      ? "退出済み"
                      : "現在は活動中の参加先ではありません"}
                </p>
              ))}
              {failedOperation.failure?.remainingSources.length ? (
                failedOperation.failure.remainingSources.map((source) => (
                  <p key={source.roomId}>{source.name}：参加中</p>
                ))
              ) : failedOperation.failure?.currentRoomId ? (
                <p>現在の参加先：{failedOperation.failure.currentRoomId}</p>
              ) : (
                <p>活動中の参加先はありません。</p>
              )}
            </>
          ) : (
            <>
              {cannotCancel && (
                <p role="status">
                  一部のルームからは退出済みです。元の参加状態には戻せません。変更したホスト交代・解散の内容を確認して、移動を続けてください。成果の選択は開始時の内容を維持します。
                </p>
              )}
              {confirmation?.sources.map((source) => (
                <section key={source.roomId} className="space-y-1">
                  <h3 className="font-semibold [overflow-wrap:anywhere]">
                    {source.name}（{source.inviteCode}）
                  </h3>
                  {source.action === "disband" ? (
                    <>
                      <p>
                        接続中のホスト引継ぎ先がいません。解散すると、切断中の人を含め全員が退出します。
                      </p>
                      <p>このルームの招待URLは使えなくなります。</p>
                      <p>途中の内容は本人向けの完了成果として残りません。</p>
                    </>
                  ) : (
                    <>
                      <p>
                        このルームから退出します。他のタブ・端末でも操作できなくなります。
                      </p>
                      {source.successor && (
                        <p>
                          ホストを「{source.successor.name}」に引き継ぎます。
                        </p>
                      )}
                    </>
                  )}
                </section>
              ))}
              {hasLeave && (
                <fieldset
                  disabled={pending || started || cannotCancel}
                  className="space-y-2"
                >
                  <legend className="mb-2 font-semibold">
                    退出するルームの成果
                  </legend>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="outcome-access"
                      checked={outcomeAccess === "discard"}
                      onChange={() => onOutcomeAccess("discard")}
                    />
                    <span>
                      成果を残さず退出
                      <br />
                      <span className="text-muted-foreground">
                        自分の一覧には残らず、成果を見返せません。
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="outcome-access"
                      checked={outcomeAccess === "retain"}
                      onChange={() => onOutcomeAccess("retain")}
                    />
                    <span>
                      成果を残して退出
                      <br />
                      <span className="text-muted-foreground">
                        ルームが完了したら「過去の成果を見る」から見返せます。解散するルームには適用されません。
                      </span>
                    </span>
                  </label>
                </fieldset>
              )}
              {message && <p role="alert">{message}</p>}
              {started && (
                <p role="status">
                  移動の処理を開始しています。結果を確認し、同じ処理を再試行できます。
                </p>
              )}
            </>
          )}
        </div>
        <AlertDialogFooter>
          {failedOperation ? (
            <Button ref={safeAction} asChild>
              <a href="/home">ホームで別のルームを選ぶ</a>
            </Button>
          ) : (
            <>
              {!started && !cannotCancel && (
                <AlertDialogCancel asChild>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={onCancel}
                  >
                    キャンセル
                  </Button>
                </AlertDialogCancel>
              )}
              <Button
                ref={safeAction}
                disabled={pending}
                variant={disband ? "destructive" : "default"}
                onClick={started ? onRetry : onConfirm}
              >
                {pending
                  ? "処理中…"
                  : started
                    ? "結果を確認・再試行"
                    : cannotCancel
                      ? "変更した内容を確認して続ける"
                      : `${disband ? "解散" : "退出"}して${verb}`}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

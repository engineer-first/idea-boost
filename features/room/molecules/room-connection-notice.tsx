import type { RoomScreenConnectionStatus } from "../logic/connection-status";
export type RoomConnectionNoticeProps = {
  status: RoomScreenConnectionStatus;
  delayed?: boolean;
  className?: string;
  testId?: string;
};
export function RoomConnectionNotice({
  status,
  delayed = false,
  className,
  testId,
}: RoomConnectionNoticeProps) {
  if (status === "open") return null;
  return (
    <div
      role="status"
      data-testid={testId}
      data-board-fit-edge={
        testId === "board-connection-status" ? "top" : undefined
      }
      className={className}
    >
      {status === "auth-required" || status === "unavailable" ? (
        <>
          <p className="font-semibold">
            {status === "auth-required"
              ? "ログインが必要です"
              : "このルームは利用できません"}
          </p>
          <p className="mt-1 leading-relaxed">
            未反映の文章がある場合は、確認・コピーしてから移動してください。
          </p>
          <a
            className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
            href={status === "auth-required" ? "/login" : "/home"}
          >
            {status === "auth-required" ? "ログインする" : "ホームへ戻る"}
          </a>
        </>
      ) : delayed ? (
        <>
          <p className="font-semibold">接続が戻っていません</p>
          <p className="mt-1 leading-relaxed">
            自動で再接続を続けています。
            <br />
            この画面を開いたままお待ちください。
          </p>
        </>
      ) : (
        <p>自動で再接続しています…</p>
      )}
    </div>
  );
}

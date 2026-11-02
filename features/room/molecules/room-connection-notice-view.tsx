import type { RoomScreenConnectionStatus } from "../logic/connection-status";
export type RoomConnectionNoticeViewProps = {
  status: RoomScreenConnectionStatus;
  delayed?: boolean;
  className?: string;
  testId?: string;
  returnHref?: string;
};
export function RoomConnectionNoticeView({
  status,
  delayed = false,
  className,
  testId,
  returnHref,
}: RoomConnectionNoticeViewProps) {
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
              ? "接続を止めました"
              : "このルームは利用できません"}
          </p>
          <p className="mt-1 leading-relaxed">
            {status === "auth-required"
              ? "本人確認の期限が切れたため、操作と更新を止めています。未反映の文章がある場合は、確認・コピーしてから再読み込みしてください。"
              : "未反映の文章がある場合は、確認・コピーしてから移動してください。"}
          </p>
          <a
            className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
            href={status === "auth-required" ? (returnHref ?? "") : "/home"}
          >
            {status === "auth-required"
              ? "再読み込みして続ける"
              : "ホームへ戻る"}
          </a>
        </>
      ) : status === "connecting" ? (
        delayed ? (
          <>
            <p className="font-semibold">接続に時間がかかっています</p>
            <p className="mt-1 leading-relaxed">
              この画面を開いたままお待ちください。
            </p>
          </>
        ) : (
          <p>ルームに接続しています…</p>
        )
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

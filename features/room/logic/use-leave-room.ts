"use client";

// 退出 / 解散フローの hook。ロビー（RoomLobby）とボード（RoomBoard）の両方で使う。
// API 成功後は Server Action の redirect でホームへ戻る。失敗時は WS を維持して
// 再操作できる状態に戻す（先に close すると失敗時に再接続不能になるため、
// close は RoomDO に任せる）。
import { useCallback, useRef, useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { leaveRoom } from "./actions";
import { roomNotify } from "./room-notify";

// redirect() は NEXT_REDIRECT を digest に持つ例外を throw する仕様（Next.js の
// 内部）。成功パスの判定に使う。
function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export type UseLeaveRoomResult = {
  // 退出処理中（多重押下防止）。true の間「退出する」ボタンは disabled。
  isLeaving: boolean;
  // WS close(4001) が leave 完了前に届いても roomDisbanded を出さないよう、
  // setState のコミットを待たず同期で読める ref。useRoomConnection へ渡す。
  isLeavingRef: React.RefObject<boolean>;
  leave: () => void;
};

export function useLeaveRoom(options: {
  roomId: string;
  isHost: boolean;
  completed?: boolean;
}): UseLeaveRoomResult {
  const { roomId, isHost, completed = false } = options;
  const [isLeaving, setIsLeaving] = useState(false);
  const [isLeavePending, startLeaveTransition] = useTransition();
  const isLeavingRef = useRef(false);

  const leave = useCallback(() => {
    if (isLeavingRef.current || isLeavePending) return;
    isLeavingRef.current = true;
    setIsLeaving(true);
    startLeaveTransition(async () => {
      const formData = new FormData();
      formData.append("roomId", roomId);
      if (completed) formData.append("intent", "self");
      try {
        await leaveRoom(formData);
      } catch (error) {
        if (isNextRedirectError(error)) {
          // 自分の操作成功をトーストで伝える（ホーム遷移後も Toaster は root にある）。
          if (isHost && !completed) {
            roomNotify.roomDisbandedBySelf();
          } else {
            roomNotify.roomLeft();
          }
          return;
        }
        // 5xx 等: WS は開いたまま、操作可能に戻す。
        isLeavingRef.current = false;
        setIsLeaving(false);
        const message =
          error instanceof Error
            ? error.message
            : "ルームからの退出に失敗しました。";
        notify.error(message);
      }
    });
  }, [isLeavePending, roomId, isHost, completed]);

  return { isLeaving, isLeavingRef, leave };
}

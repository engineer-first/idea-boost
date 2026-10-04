"use client";

// 招待URL (/invite/[code]) で開かれる確認画面のコンテナ。
// 招待コードを Dialog で表示し、確定で joinRoom Server Action を呼ぶ。
// 成功時は toast → スタート画面へ遷移（ホーム参加・作成と同じ経路）。
// hostName は page 側の lookup 成功後に必ず渡る。表示は
// templates/invite-code-dialog-view が担い、ここは配線に徹する。
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import { joinRoom } from "../logic/actions";
import { lifecycleNotify } from "../logic/lifecycle-notify";
import { InviteCodeDialogView } from "../templates/invite-code-dialog-view";

export type InviteCodeDialogProps = {
  currentUserId?: string;
  inviteCode: string;
  hostName: string;
};

export function InviteCodeDialog({
  currentUserId,
  inviteCode,
  hostName,
}: InviteCodeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  // SSR で描画された直後に user が Dialog を見て「参加する」を押せるよう、
  // initial は open。Esc やオーバーレイクリックで閉じた場合は /home へ戻す。
  useEffect(() => {
    if (!open) {
      window.location.href = "/home";
    }
  }, [open]);

  function handleConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("code", inviteCode);
      const result = await joinRoom(formData);
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      if (currentUserId) rememberLastRoom(currentUserId, result.roomId);
      lifecycleNotify.joinedAsGuest();
      // open を false にすると useEffect が /home へ飛ばすため、成功時は開いたまま遷移する。
      router.push(`/rooms/${result.roomId}/start`);
    });
  }

  return (
    <InviteCodeDialogView
      inviteCode={inviteCode}
      hostName={hostName}
      open={open}
      pending={pending}
      onOpenChange={setOpen}
      onConfirm={handleConfirm}
    />
  );
}

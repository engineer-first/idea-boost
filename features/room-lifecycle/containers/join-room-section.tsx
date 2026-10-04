"use client";

// ホーム「ルームに参加」セクション（organism / コンテナ）。
// 見た目は JoinRoomSectionView、フォームの副作用は JoinRoomForm 相当のロジックを内包。
// JoinRoomForm は単体でも使えるため、ここでは View + コンテナの配線に寄せる。
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import { joinRoom, lookupInviteRoom } from "../logic/actions";
import { lifecycleNotify } from "../logic/lifecycle-notify";
import { JoinRoomSectionView } from "../templates/join-room-section-view";

export function JoinRoomSection({ currentUserId }: { currentUserId?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [showCodeError, setShowCodeError] = useState(false);
  const [hostName, setHostName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lookingUp, startLookup] = useTransition();
  const [joining, startJoin] = useTransition();

  const isValidCode = /^[A-Z0-9]{6}$/.test(code);
  const codeError =
    showCodeError && !isValidCode ? "英数字6桁で入力してください。" : undefined;

  function handleCodeChange(value: string) {
    setCode(value);
    setShowCodeError(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidCode) {
      setShowCodeError(code.length > 0);
      return;
    }
    startLookup(async () => {
      const result = await lookupInviteRoom(code);
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      setHostName(result.hostName);
      setDialogOpen(true);
    });
  }

  function handleConfirm() {
    if (!isValidCode) return;
    startJoin(async () => {
      const formData = new FormData();
      formData.append("code", code);
      const result = await joinRoom(formData);
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      if (currentUserId) rememberLastRoom(currentUserId, result.roomId);
      lifecycleNotify.joinedAsGuest();
      setDialogOpen(false);
      router.push(`/rooms/${result.roomId}/start`);
    });
  }

  return (
    <JoinRoomSectionView
      code={code}
      onCodeChange={handleCodeChange}
      onCodeBlur={() => setShowCodeError(code.length > 0 && !isValidCode)}
      codeError={codeError}
      lookingUp={lookingUp}
      joining={joining}
      dialogOpen={dialogOpen}
      onDialogOpenChange={setDialogOpen}
      hostName={hostName}
      onSubmit={handleSubmit}
      onConfirm={handleConfirm}
    />
  );
}

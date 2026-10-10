"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import { joinRoom, lookupInviteRoom } from "../logic/actions";
import { entryDestination } from "../logic/entry-destination";
import { lifecycleNotify } from "../logic/lifecycle-notify";
import { JoinRoomSectionView } from "../templates/join-room-section-view";
// ホーム「ルームに参加」セクション（organism / コンテナ）。
// 見た目は JoinRoomSectionView、フォームの副作用は JoinRoomForm 相当のロジックを内包。
// JoinRoomForm は単体でも使えるため、ここでは View + コンテナの配線に寄せる。
import { RoomReauthentication } from "./room-reauthentication";

export function JoinRoomSection({ currentUserId }: { currentUserId?: string }) {
  const router = useRouter();
  const [reauth, setReauth] = useState(false);
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
        if (result.reason === "reauth_required") {
          setReauth(true);
          return;
        }
        notify.error(result.error);
        return;
      }
      let href: string;
      try {
        href = await entryDestination(
          `/rooms/${result.roomId}/start`,
          result.roomId,
          result.entryToken,
        );
      } catch {
        notify.error(
          "ルームへの移動を確認できませんでした。もう一度お試しください。",
        );
        return;
      }
      if (currentUserId) rememberLastRoom(currentUserId, result.roomId);
      lifecycleNotify.joinedAsGuest();
      setDialogOpen(false);
      router.push(href);
    });
  }

  return (
    <>
      <JoinRoomSectionView
        code={code}
        onCodeChange={handleCodeChange}
        onCodeBlur={() => setShowCodeError(code.length > 0 && !isValidCode)}
        codeError={codeError}
        lookingUp={lookingUp}
        joining={joining}
        dialogOpen={dialogOpen && !reauth}
        onDialogOpenChange={setDialogOpen}
        hostName={hostName}
        onSubmit={handleSubmit}
        onConfirm={handleConfirm}
      />
      {reauth && (
        <RoomReauthentication
          operation={{ kind: "join", inviteCode: code }}
          onClosed={() => document.getElementById("code")?.focus()}
          onBack={() => {
            setReauth(false);
            setDialogOpen(false);
          }}
        />
      )}
    </>
  );
}

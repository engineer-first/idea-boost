"use client";
import { useState, useTransition } from "react";
import type { RoomEntryOperation } from "@/contracts/room-entry";
import { startRoomReauthentication } from "@/features/auth";
import { getRoomEntryTabId } from "../logic/room-entry-tab";
import { RoomReauthenticationView } from "../templates/room-reauthentication-view";
export function RoomReauthentication({
  operation,
  onBack,
}: {
  operation: RoomEntryOperation;
  onBack?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  return (
    <RoomReauthenticationView
      pending={pending}
      message={message}
      onBack={
        onBack ??
        (() => {
          window.location.href = "/home";
        })
      }
      onContinue={() => {
        let tabId: string;
        try {
          tabId = getRoomEntryTabId();
        } catch {
          setMessage(
            "文章を確認・コピーしてから、ブラウザの保存設定を確認してください。",
          );
          return;
        }
        startTransition(async () => {
          try {
            await startRoomReauthentication(operation, tabId);
          } catch {
            setMessage(
              "ログインを開始できませんでした。通信を確認してもう一度お試しください。",
            );
          }
        });
      }}
    />
  );
}

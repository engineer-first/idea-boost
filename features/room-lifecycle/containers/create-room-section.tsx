"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import { createRoom, returnToRoom } from "../logic/actions";
import { lifecycleNotify } from "../logic/lifecycle-notify";
import {
  clearRoomCreationIntent,
  type RoomCreationIntent,
  readRoomCreationIntent,
  saveRoomCreationIntent,
} from "../logic/room-creation-storage";
import { CreateRoomSectionView } from "../templates/create-room-section-view";

export function CreateRoomSection({
  currentUserId,
}: {
  currentUserId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [intent, setIntent] = useState<RoomCreationIntent | null>(null);
  const [message, setMessage] = useState<string>();
  const [initialized, setInitialized] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    try {
      const saved = currentUserId
        ? readRoomCreationIntent(currentUserId)
        : null;
      setIntent(saved);
      if (saved)
        setMessage(
          "前回の作成結果を確認できていません。同じ作成を確認・再試行してください。",
        );
      setStorageError(false);
    } catch {
      setStorageError(true);
      setMessage(
        "作成要求の記録を読み取れません。ブラウザの保存設定を確認して再読み込みしてください。",
      );
    }
    setInitialized(true);
  }, [currentUserId]);

  function handleSubmit(name: string) {
    if (submitting.current || storageError) return;
    const next = intent ?? {
      requestId: crypto.randomUUID(),
      name: name.trim(),
    };
    try {
      if (currentUserId) saveRoomCreationIntent(currentUserId, next);
    } catch {
      setMessage(
        "作成要求を保存できません。ブラウザの保存設定を確認してください。",
      );
      return;
    }
    setIntent(next);
    submitting.current = true;
    startTransition(async () => {
      try {
        const result = await createRoom(next);
        if (!result.ok) {
          setMessage(result.error);
          notify.error(result.error);
          return;
        }
        if (currentUserId) rememberLastRoom(currentUserId, result.roomId);
        const destination = await returnToRoom(result.roomId);
        if (destination.kind !== "ready") {
          setMessage(
            "ルームは作成済みですが、移動先を確認できません。同じ作成を確認・再試行してください。",
          );
          return;
        }
        if (currentUserId) clearRoomCreationIntent(currentUserId);
        setIntent(null);
        setMessage(undefined);
        lifecycleNotify.roomCreated();
        router.push(destination.href);
      } catch {
        setMessage(
          "作成結果を確認できません。同じ作成を確認・再試行してください。",
        );
      } finally {
        submitting.current = false;
      }
    });
  }

  function handleNewIntent() {
    try {
      if (currentUserId) clearRoomCreationIntent(currentUserId);
      setIntent(null);
      setMessage(undefined);
      setStorageError(false);
    } catch {
      setMessage(
        "作成要求の記録を更新できません。ブラウザの保存設定を確認してください。",
      );
    }
  }

  return (
    <CreateRoomSectionView
      pending={pending || !initialized}
      onSubmit={handleSubmit}
      intentName={intent?.name}
      recovering={Boolean(intent)}
      message={message}
      storageError={storageError}
      onNewIntent={handleNewIntent}
    />
  );
}

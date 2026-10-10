"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { consumeRoomResume } from "@/features/auth";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import {
  createRoom,
  joinRoom,
  queryRoomCreation,
  returnToRoom,
} from "../logic/actions";
import { entryDestination } from "../logic/entry-destination";
import {
  readRoomCreationIntent,
  saveRoomCreationResult,
} from "../logic/room-creation-storage";
import { getRoomEntryTabId } from "../logic/room-entry-tab";
export function RoomOperationResume({
  initialError,
}: {
  initialError?: string;
} = {}) {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState(
    initialError === "account_changed"
      ? "アカウントが変わりました。元のアカウントでログインしてください。"
      : initialError
        ? "ログインを完了できませんでした。元の画面からもう一度お試しください。"
        : "元の操作を確認しています…",
  );
  useEffect(() => {
    if (started.current || initialError) return;
    started.current = true;
    async function resume() {
      const grant = await consumeRoomResume(getRoomEntryTabId());
      if (!grant.ok) {
        setMessage(
          grant.reason === "account_changed"
            ? "アカウントが変わりました。元のアカウントでログインしてください。"
            : "元の操作を確認できませんでした。元の画面からもう一度お試しください。",
        );
        return;
      }
      const { operation, principal } = grant;
      let roomId: string;
      let admission: string | undefined;
      let href: string;
      if (operation.kind === "create") {
        const queried = await queryRoomCreation(
          principal,
          operation.input.requestId,
        );
        if (!queried.ok) {
          setMessage(queried.error);
          return;
        }
        if (queried.status.kind === "ready") roomId = queried.status.roomId;
        else {
          const result = await createRoom(operation.input);
          if (!result.ok) {
            setMessage(result.error);
            return;
          }
          roomId = result.roomId;
          admission = result.entryToken;
        }
        const saved = await readRoomCreationIntent(principal);
        if (saved?.requestId === operation.input.requestId)
          await saveRoomCreationResult(principal, saved, roomId);
        const destination = admission
          ? {
              kind: "ready" as const,
              href: `/rooms/${roomId}/start`,
              entryToken: admission,
            }
          : await returnToRoom(roomId, principal);
        if (destination.kind !== "ready") {
          setMessage(
            "ルームを開けませんでした。ホームからもう一度お試しください。",
          );
          return;
        }
        href = destination.href;
        admission = destination.entryToken ?? admission;
      } else if (operation.kind === "join") {
        const form = new FormData();
        form.set("code", operation.inviteCode);
        const result = await joinRoom(form, principal);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        roomId = result.roomId;
        admission = result.entryToken;
        href = `/rooms/${roomId}/start`;
      } else {
        roomId = operation.roomId;
        const result = await returnToRoom(roomId, principal);
        if (result.kind !== "ready") {
          setMessage("このルームには戻れません。ホームから確認してください。");
          return;
        }
        href = result.href;
        admission = result.entryToken;
      }
      rememberLastRoom(principal, roomId);
      router.replace(await entryDestination(href, roomId, admission));
    }
    void resume().catch(() =>
      setMessage(
        "操作を続けられませんでした。文章の控えを残し、元の画面からもう一度お試しください。",
      ),
    );
  }, [router, initialError]);
  return (
    <section className="mx-auto w-full max-w-md space-y-4 p-6">
      <p role="status" className="leading-relaxed">
        {message}
      </p>
      <a
        href="/home"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        ホームへ戻る
      </a>
    </section>
  );
}

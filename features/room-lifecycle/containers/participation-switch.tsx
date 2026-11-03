"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ParticipationConfirmation } from "@/contracts/room-participation";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import { entryDestination } from "../logic/entry-destination";
import { lifecycleNotify } from "../logic/lifecycle-notify";
import {
  type ParticipationActionResult,
  queryParticipation,
} from "../logic/participation-actions";
import { ParticipationSwitchView } from "../templates/participation-switch-view";
export function ParticipationSwitch({
  currentUserId,
  confirmation,
  pendingOperation,
  failedOperation,
  onReady,
}: {
  currentUserId: string;
  confirmation?: ParticipationConfirmation;
  pendingOperation?: Extract<ParticipationActionResult, { kind: "pending" }>;
  failedOperation?: Extract<ParticipationActionResult, { kind: "rejected" }>;
  onReady?: (roomId: string) => Promise<void>;
}) {
  const router = useRouter();
  const originalId = confirmation?.operationId ?? pendingOperation?.operationId;
  const operation = useRef(originalId);
  const principal = useRef(currentUserId);
  principal.current = currentUserId;
  const submitting = useRef(false);
  const started = useRef(false);
  const [pending, setPending] = useState(
    Boolean(originalId && !failedOperation),
  );
  const [terminal, setTerminal] = useState(Boolean(failedOperation));
  const [message, setMessage] = useState<string>();
  async function resume(): Promise<void> {
    if (submitting.current || !operation.current || terminal) return;
    const actor = currentUserId;
    submitting.current = true;
    setPending(true);
    setMessage(undefined);
    let navigating = false;
    try {
      const id = operation.current;
      const result = await queryParticipation(id, actor);
      if (principal.current !== actor) return;
      if (result.kind === "ready") {
        if (onReady && id === originalId) await onReady(result.roomId);
        if (principal.current !== actor) return;
        const href = await entryDestination(
          `/rooms/${result.roomId}/start`,
          result.roomId,
          result.entryToken,
        );
        if (principal.current !== actor) return;
        rememberLastRoom(actor, result.roomId);
        lifecycleNotify.rememberDeparture(
          result.roomId,
          result.operationId ?? id,
          result.exitedRoomNames,
        );
        router.push(href);
        router.refresh();
        navigating = true;
      } else if (result.kind === "pending") {
        operation.current = result.operationId;
        setMessage("ルームに移動できませんでした。");
      } else if (result.kind === "rejected") {
        setTerminal(Boolean(result.failure));
        setMessage("ルームに移動できませんでした。");
      } else {
        setMessage("ページを読み直して、もう一度お試しください。");
      }
    } catch {
      if (principal.current === actor)
        setMessage("通信が途切れました。もう一度お試しください。");
    } finally {
      submitting.current = false;
      if (!navigating) setPending(false);
    }
  }
  useEffect(() => {
    if (started.current || failedOperation) return;
    started.current = true;
    void resume();
  });
  return (
    <ParticipationSwitchView
      pending={pending}
      terminal={terminal}
      message={message}
      onRetry={() => void resume()}
    />
  );
}

"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ParticipationConfirmation } from "@/contracts/room-participation";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import { entryDestination } from "../logic/entry-destination";
import {
  commitParticipation,
  type ParticipationActionResult,
  queryParticipation,
} from "../logic/participation-actions";
import { ParticipationSwitchView } from "../templates/participation-switch-view";
export function ParticipationSwitch({
  currentUserId,
  confirmation: initial,
  pendingOperation: initialPendingOperation,
  failedOperation: initialFailure,
  onCancel,
  onReady,
}: {
  currentUserId: string;
  confirmation?: ParticipationConfirmation;
  pendingOperation?: Extract<ParticipationActionResult, { kind: "pending" }>;
  failedOperation?: Extract<ParticipationActionResult, { kind: "rejected" }>;
  onCancel?: () => void;
  onReady?: (roomId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [failedOperation, setFailedOperation] = useState(initialFailure);
  const [confirmation, setConfirmation] = useState(initial);
  const [pendingOperation, setPendingOperation] = useState(
    initialPendingOperation,
  );
  const [outcomeAccess, setOutcomeAccess] = useState<"retain" | "discard">(
    initial?.outcomeAccess ?? "discard",
  );
  const [pending, setPending] = useState(false);
  const [started, setStarted] = useState(Boolean(pendingOperation));
  const [message, setMessage] = useState<string | undefined>(
    pendingOperation?.error,
  );
  const submitting = useRef(false);
  const principal = useRef(currentUserId);
  principal.current = currentUserId;
  async function apply(result: ParticipationActionResult) {
    if (result.kind === "confirmation") {
      setPendingOperation(undefined);
      setConfirmation(result.confirmation);
      setStarted(false);
      setOutcomeAccess(result.confirmation.outcomeAccess ?? "discard");
      setMessage(
        "参加状況が変わりました。内容を確認して、もう一度決定してください。",
      );
    } else if (result.kind === "ready") {
      const operationId =
        pendingOperation?.operationId ?? confirmation?.operationId;
      const originalId =
        initial?.operationId ?? initialPendingOperation?.operationId;
      // 別タブの移動結果を、呼出元が保持する作成要求へ保存しない。
      if (onReady && operationId === originalId) await onReady(result.roomId);
      rememberLastRoom(currentUserId, result.roomId);
      router.push(
        await entryDestination(
          `/rooms/${result.roomId}/start`,
          result.roomId,
          result.entryToken,
        ),
      );
      router.refresh();
    } else {
      if (result.kind === "pending") {
        setPendingOperation(result);
        setConfirmation(undefined);
      }
      if (result.kind === "rejected" && result.failure) {
        setFailedOperation(result);
        setStarted(false);
        return;
      }
      setMessage(result.error);
      if (result.kind === "rejected" && confirmation) setStarted(false);
    }
  }
  async function submit(retry = false) {
    if (submitting.current) return;
    const operationId =
      confirmation?.operationId ?? pendingOperation?.operationId;
    if (!operationId) return;
    const actor = currentUserId;
    submitting.current = true;
    setPending(true);
    setStarted(true);
    setMessage(undefined);
    try {
      const result = retry
        ? await queryParticipation(operationId, actor)
        : confirmation
          ? await commitParticipation(
              operationId,
              actor,
              outcomeAccess,
              confirmation.version,
            )
          : null;
      if (!result || principal.current !== actor) return;

      if (principal.current === actor) await apply(result);
    } catch {
      if (principal.current === actor)
        setMessage(
          "通信が途切れました。移動が完了したか結果を確認してください。",
        );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <ParticipationSwitchView
      failedOperation={failedOperation}
      confirmation={confirmation}
      pendingTargetName={pendingOperation?.targetName}
      outcomeAccess={outcomeAccess}
      onOutcomeAccess={setOutcomeAccess}
      pending={pending}
      started={started}
      message={message}
      onCancel={onCancel ?? (() => router.push("/home"))}
      onConfirm={() => void submit()}
      onRetry={() => void submit(true)}
    />
  );
}

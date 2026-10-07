"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import {
  createRoom,
  issueRoomCreation,
  queryRoomCreation,
  returnToRoom,
} from "./actions";
import { lifecycleNotify } from "./lifecycle-notify";
import {
  discardRoomCreationRecords,
  isRoomCreationSelected,
  markRoomCreationSubmitted,
  notifyRoomCreations,
  type RoomCreationIntent,
  readRoomCreationIntent,
  saveRoomCreationIntent,
  saveRoomCreationResult,
  subscribeRoomCreations,
  updateRoomCreationIntent,
} from "./room-creation-storage";

export type RoomCreationControls = {
  pending: boolean;
  onSubmit: (name: string) => void;
  intentName?: string;
  recovering: boolean;
  recoveryState?: string;
  message?: string;
  storageError: boolean;
  onNewIntent: () => void;
  onDiscard: () => void;
  requiresNewConfirmation: boolean;
  onRecover: () => void;
};
export function useRoomCreation(currentUserId?: string): RoomCreationControls {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [intent, setIntent] = useState<RoomCreationIntent | null>(null);
  const [newIntent, setNewIntent] = useState(false);
  const [retryDestination, setRetryDestination] = useState(false);
  const [message, setMessage] = useState<string>();
  const [initialized, setInitialized] = useState(false);
  const [loadedPrincipal, setLoadedPrincipal] = useState<string>();
  const [storageError, setStorageError] = useState(false);
  const actor = useRef(currentUserId);
  actor.current = currentUserId;
  const generation = useRef(0);
  const submitting = useRef(false);
  useEffect(() => {
    let live = true;
    generation.current++;
    setInitialized(false);
    setMessage(undefined);
    setNewIntent(false);
    setRetryDestination(false);
    let readGeneration = 0;
    async function refresh() {
      const readTurn = ++readGeneration,
        currentGeneration = generation.current;
      if (!currentUserId) {
        setStorageError(true);
        setMessage("ログイン状態を確認してください。");
        setLoadedPrincipal(currentUserId);
        setInitialized(true);
        return;
      }
      try {
        let saved = await readRoomCreationIntent(currentUserId);
        let changed = false;
        if (
          !live ||
          readTurn !== readGeneration ||
          currentGeneration !== generation.current
        )
          return;
        // ホーム表示で行うのは本人の読み取りだけ。作成を自動再送しない。
        if (
          saved &&
          !saved.roomId &&
          saved.state !== "closed" &&
          !submitting.current
        ) {
          const result = await queryRoomCreation(
            currentUserId,
            saved.requestId,
          ).catch(() => null);
          if (
            !live ||
            readTurn !== readGeneration ||
            currentGeneration !== generation.current
          )
            return;
          if (
            await isRoomCreationSelected(
              currentUserId,
              saved.requestId,
              saved.generation,
            )
          ) {
            if (
              !live ||
              readTurn !== readGeneration ||
              currentGeneration !== generation.current
            )
              return;
            if (result?.ok && result.status.kind === "ready") {
              saved = await saveRoomCreationResult(
                currentUserId,
                saved,
                result.status.roomId,
              );
              changed = true;
            } else if (
              result?.ok &&
              (result.status.kind === "closed" ||
                result.status.acceptance === "expired")
            ) {
              const state =
                result.status.kind === "closed" ? "closed" : "expired";
              if (saved.state !== state) {
                saved = await updateRoomCreationIntent(currentUserId, saved, {
                  state,
                  name: "",
                });
                changed = true;
              }
            }
          }
        }
        if (
          !live ||
          readTurn !== readGeneration ||
          currentGeneration !== generation.current
        )
          return;
        setIntent(saved);
        setStorageError(false);
        if (changed) notifyRoomCreations();
      } catch {
        if (
          live &&
          readTurn === readGeneration &&
          currentGeneration === generation.current
        ) {
          setStorageError(true);
          setMessage(
            "このブラウザで作成を続けられません。別タブを閉じ、保存設定を確認して再読み込みしてください。",
          );
        }
      }
      if (
        live &&
        readTurn === readGeneration &&
        currentGeneration === generation.current
      ) {
        setLoadedPrincipal(currentUserId);
        setInitialized(true);
      }
    }
    void refresh();
    const unsubscribe = subscribeRoomCreations(() => void refresh());
    return () => {
      live = false;
      generation.current++;
      unsubscribe();
    };
  }, [currentUserId]);
  const currentIntent =
    intent?.expectedPrincipal === currentUserId ? intent : null;
  const startsNew =
    newIntent ||
    (!retryDestination &&
      (currentIntent?.state === "known" ||
        currentIntent?.state === "expired" ||
        currentIntent?.state === "closed"));
  const recovering = Boolean(currentIntent) && !startsNew;
  function handleSubmit(name: string, resume = false) {
    if (submitting.current || storageError || !currentUserId) return;
    const principal = currentUserId,
      turn = generation.current;
    const sameActor = () =>
      actor.current === principal && generation.current === turn;
    submitting.current = true;
    startTransition(async () => {
      let next = !resume && startsNew ? null : currentIntent;
      try {
        if (!next) {
          const issued = await issueRoomCreation(principal);
          if (!sameActor()) return;
          if (!issued.ok) {
            setMessage(issued.error);
            return;
          }
          const candidate: RoomCreationIntent = {
            ...issued.issued,
            expectedPrincipal: principal,
            name: name.trim(),
            state: "prepared",
            generation: crypto.randomUUID(),
          };
          next = await saveRoomCreationIntent(
            principal,
            candidate,
            currentIntent?.requestId ?? null,
          );
          if (!sameActor()) return;
          setIntent(next);
          setNewIntent(false);
          setRetryDestination(false);
          notifyRoomCreations();
          if (next.requestId !== candidate.requestId) {
            setMessage(
              "別タブでルームの作成が進んでいます。その操作を続けるか、新しいルームを作成してください。",
            );
            return;
          }
        }
        const selected = async () =>
          sameActor() &&
          next !== null &&
          (await isRoomCreationSelected(
            principal,
            next.requestId,
            next.generation,
          )) &&
          sameActor();
        if (!(await selected())) return;
        let roomId = next.roomId;
        if (!roomId) {
          const query = await queryRoomCreation(principal, next.requestId);
          if (!(await selected())) return;
          if (!query.ok) {
            setMessage(
              query.reason === "actor_mismatch"
                ? "アカウントが変わりました。ログイン状態を確認してください。"
                : "ルームを開けませんでした。もう一度お試しください。",
            );
            return;
          }
          if (query.status.kind === "ready") roomId = query.status.roomId;
          else if (
            query.status.kind === "closed" ||
            query.status.acceptance === "expired"
          ) {
            next = await updateRoomCreationIntent(principal, next, {
              state: query.status.kind === "closed" ? "closed" : "expired",
              name: "",
            });
            if (!(await selected())) return;
            setIntent(next);
            setMessage(
              query.status.kind === "closed"
                ? "前のルームには戻れません。新しいルームを作成できます。"
                : "前のルームを開けませんでした。新しいルームを作成するか、もう一度探してください。",
            );
            return;
          } else if (next.state === "conflict") {
            setMessage(
              "入力内容を確認できません。前のルームを探すか、新しいルームを作成してください。",
            );
            return;
          } else {
            next = await markRoomCreationSubmitted(principal, next);
            if (!(await selected())) return;
            setIntent(next);
            const result = await createRoom({
              expectedPrincipal: principal,
              requestId: next.requestId,
              name: next.name,
            });
            // 結果receiptは自分のrecordだけ更新。遷移と現在UIは選択照合後。
            if (result.ok) roomId = result.roomId;
            else {
              if (!(await selected())) return;
              const error =
                result.outcome === "unknown"
                  ? "ルームへの移動を完了できませんでした。もう一度お試しください。"
                  : result.reason === "expired"
                    ? "前のルームを開けませんでした。新しいルームを作成するか、もう一度探してください。"
                    : result.reason === "closed"
                      ? "前のルームには戻れません。新しいルームを作成できます。"
                      : result.reason === "update_required"
                        ? "画面を再読み込みしてから、もう一度お試しください。"
                        : result.reason === "input_conflict"
                          ? "入力内容を確認できません。前のルームを探すか、新しいルームを作成してください。"
                          : result.error;
              setMessage(error);
              notify.error(error);
              if (
                result.reason === "actor_mismatch" ||
                result.reason === "input_conflict" ||
                result.reason === "expired" ||
                result.reason === "closed"
              ) {
                next = await updateRoomCreationIntent(principal, next, {
                  state:
                    result.reason === "actor_mismatch"
                      ? "actor_mismatch"
                      : result.reason === "input_conflict"
                        ? "conflict"
                        : result.reason,
                  ...(["expired", "closed"].includes(result.reason)
                    ? { name: "" }
                    : {}),
                });
                if (!(await selected())) return;
                setIntent(next);
              }
              return;
            }
          }
          next = await saveRoomCreationResult(principal, next, roomId);
        }
        if (!(await selected())) return;
        setIntent(next);
        rememberLastRoom(principal, roomId);
        const destination = await returnToRoom(roomId);
        if (!(await selected())) return;
        if (destination.kind !== "ready") {
          setRetryDestination(true);
          setMessage(
            destination.kind === "unavailable_room"
              ? "作成済みのルームは現在利用できません。"
              : "ルームを開けませんでした。もう一度お試しください。",
          );
          return;
        }
        setRetryDestination(false);
        lifecycleNotify.roomCreated();
        router.push(destination.href);
        // 同タブのServer Actionによる自動確認で、開始した移動を取り消さない。
        notifyRoomCreations(false);
      } catch {
        if (sameActor()) {
          if (next?.roomId) {
            setIntent(next);
            setRetryDestination(true);
            notifyRoomCreations();
          }
          setMessage(
            next?.roomId
              ? "ルームを開けませんでした。もう一度お試しください。"
              : "作成を続けられません。ブラウザの保存設定を確認してもう一度お試しください。",
          );
        }
      } finally {
        submitting.current = false;
      }
    });
  }
  function handleNewIntent() {
    if (!currentUserId || submitting.current) return;
    generation.current++;
    // 保存済みの選択は実際の作成まで維持する。確認のキャンセルで失わない。
    setNewIntent(true);
    setRetryDestination(false);
    setMessage(undefined);
  }
  function handleDiscard() {
    if (
      !currentUserId ||
      !window.confirm(
        "このブラウザの保存をリセットすると、前のルームを見つけられなくなる可能性があります。次に新しいルームを作ると両方が残ることがあります。リセットしますか？",
      )
    )
      return;
    const principal = currentUserId,
      turn = ++generation.current;
    const current = () =>
      actor.current === principal && generation.current === turn;
    startTransition(async () => {
      try {
        await discardRoomCreationRecords(principal);
        if (!current()) return;
        setIntent(null);
        setNewIntent(false);
        setRetryDestination(false);
        setMessage(undefined);
        setStorageError(false);
      } catch {
        if (current())
          setMessage(
            "保存をリセットできません。保存設定を確認して再読み込みしてください。",
          );
      }
    });
  }
  return {
    pending: pending || !initialized || loadedPrincipal !== currentUserId,
    onSubmit: handleSubmit,
    intentName: recovering ? currentIntent?.name : undefined,
    recovering,
    recoveryState: currentIntent?.state,
    message: loadedPrincipal === currentUserId ? message : undefined,
    storageError,
    onNewIntent: handleNewIntent,
    onDiscard: handleDiscard,
    requiresNewConfirmation:
      startsNew &&
      Boolean(
        currentIntent &&
          !currentIntent.roomId &&
          currentIntent.state !== "prepared" &&
          currentIntent.state !== "closed",
      ),
    onRecover: () => handleSubmit("", true),
  };
}

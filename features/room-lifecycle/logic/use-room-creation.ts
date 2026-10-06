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
  clearRoomCreationIntent,
  discardRoomCreationRecords,
  isRoomCreationSelected,
  listRoomCreationIntents,
  markRoomCreationSubmitted,
  notifyRoomCreations,
  type RoomCreationIntent,
  readRoomCreationIntent,
  saveRoomCreationIntent,
  saveRoomCreationResult,
  selectRoomCreationIntent,
  subscribeRoomCreations,
  updateRoomCreationIntent,
} from "./room-creation-storage";

export type RoomCreationControls = {
  pending: boolean;
  onSubmit: (name: string) => void;
  intentName?: string;
  recovering: boolean;
  recoveryState?: string;
  issuedAt?: number;
  message?: string;
  storageError: boolean;
  onNewIntent: () => void;
  onDiscard: () => void;
  savedIntents: { requestId: string; name: string; state: string }[];
  onSelectIntent: (requestId: string) => void;
};
export function useRoomCreation(currentUserId?: string): RoomCreationControls {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [intent, setIntent] = useState<RoomCreationIntent | null>(null);
  const [records, setRecords] = useState<RoomCreationIntent[]>([]);
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
        const saved = await readRoomCreationIntent(currentUserId);
        const list = await listRoomCreationIntents(currentUserId);
        if (
          !live ||
          readTurn !== readGeneration ||
          currentGeneration !== generation.current
        )
          return;
        setIntent(saved);
        setRecords(list);
        setStorageError(false);
      } catch {
        if (
          live &&
          readTurn === readGeneration &&
          currentGeneration === generation.current
        ) {
          setStorageError(true);
          setMessage(
            "控えを読み取れません。別タブを閉じ、保存設定を確認して再読み込みしてください。",
          );
        }
      }
      if (
        live &&
        readTurn === readGeneration &&
        currentGeneration === generation.current
      )
        setLoadedPrincipal(currentUserId);
      setInitialized(true);
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
  function handleSubmit(name: string) {
    if (submitting.current || storageError || !currentUserId) return;
    const principal = currentUserId,
      turn = generation.current;
    const sameActor = () =>
      actor.current === principal && generation.current === turn;
    submitting.current = true;
    startTransition(async () => {
      let next = currentIntent;
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
          next = await saveRoomCreationIntent(principal, candidate);
          if (!sameActor()) return;
          setIntent(next);
          notifyRoomCreations();
          if (next.requestId !== candidate.requestId) {
            setMessage(
              "別タブの作成の控えがあります。前回を確認するか、別のルームを選んでください。",
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
            setMessage(query.error);
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
                ? "このルームは終了または削除されています。"
                : "作成を再試行できる24時間が過ぎました。既に作成された可能性があるため、結果の確認は続けられます。",
            );
            return;
          } else if (next.state === "conflict") {
            setMessage(
              "この控えの入力を受け付けられません。結果だけを確認するか、別のルームを選んでください。",
            );
            return;
          } else {
            next = await markRoomCreationSubmitted(principal, next);
            if (!(await selected())) return;
            const result = await createRoom({
              expectedPrincipal: principal,
              requestId: next.requestId,
              name: next.name,
            });
            // 結果receiptは自分のrecordだけ更新。遷移と現在UIは選択照合後。
            if (result.ok) roomId = result.roomId;
            else {
              if (!(await selected())) return;
              setMessage(result.error);
              notify.error(result.error);
              if (
                result.reason === "actor_mismatch" ||
                result.reason === "input_conflict"
              ) {
                next = await updateRoomCreationIntent(principal, next, {
                  state:
                    result.reason === "actor_mismatch"
                      ? "actor_mismatch"
                      : "conflict",
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
          setMessage(
            destination.kind === "unavailable_room"
              ? "作成済みのルームは現在利用できません。"
              : "作成済みです。移動先を確認できないため、後でルームを開いてください。",
          );
          return;
        }
        lifecycleNotify.roomCreated();
        router.push(destination.href);
      } catch {
        if (sameActor())
          setMessage(
            next?.roomId
              ? "作成済みの控えを残しています。もう一度ルームを開いてください。"
              : "控えの保存・結果を確認できません。保存設定を確認して再試行してください。",
          );
      } finally {
        submitting.current = false;
      }
    });
  }
  function handleNewIntent() {
    if (!currentUserId) return;
    const principal = currentUserId,
      turn = ++generation.current;
    const current = () =>
      actor.current === principal && generation.current === turn;
    startTransition(async () => {
      try {
        await clearRoomCreationIntent(principal, currentIntent?.requestId);
        if (!current()) return;
        const list = await listRoomCreationIntents(principal);
        if (!current()) return;
        setIntent(null);
        setMessage(undefined);
        setRecords(list);
        notifyRoomCreations();
      } catch {
        if (current()) {
          setStorageError(true);
          setMessage("控えの選択を保存できません。");
        }
      }
    });
  }
  function handleSelect(requestId: string) {
    if (!currentUserId) return;
    const principal = currentUserId,
      turn = ++generation.current;
    const current = () =>
      actor.current === principal && generation.current === turn;
    startTransition(async () => {
      try {
        await selectRoomCreationIntent(principal, requestId);
        if (!current()) return;
        const selected = await readRoomCreationIntent(principal);
        if (!current()) return;
        setIntent(selected);
        setMessage(undefined);
        notifyRoomCreations();
      } catch {
        if (current()) {
          setStorageError(true);
          setMessage("控えを読み取れません。");
        }
      }
    });
  }
  function handleDiscard() {
    if (
      !currentUserId ||
      !window.confirm(
        "控えを破棄すると、作成済みのルームを見つけられなくなる可能性があります。次に別のルームを作ると両方が残ることがあります。破棄しますか？",
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
        setRecords([]);
        setMessage(undefined);
        setStorageError(false);
      } catch {
        if (current())
          setMessage(
            "控えを破棄できません。保存設定を確認して再読み込みしてください。",
          );
      }
    });
  }
  return {
    pending: pending || !initialized || loadedPrincipal !== currentUserId,
    onSubmit: handleSubmit,
    intentName: currentIntent?.name,
    recovering: Boolean(currentIntent),
    recoveryState: currentIntent?.state,
    issuedAt: currentIntent?.issuedAt,
    message: loadedPrincipal === currentUserId ? message : undefined,
    storageError,
    onNewIntent: handleNewIntent,
    onDiscard: handleDiscard,
    savedIntents: records
      .filter(
        (r) =>
          r.expectedPrincipal === currentUserId &&
          r.requestId !== currentIntent?.requestId,
      )
      .map((r) => ({ requestId: r.requestId, name: r.name, state: r.state })),
    onSelectIntent: handleSelect,
  };
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  clearLastRoom,
  LAST_ROOM_STORAGE_KEY,
  readLastRoom,
  rememberLastRoom,
} from "@/lib/room-client/last-room-storage";
import { queryRoomCreation, returnToRoom } from "../logic/actions";
import { entryDestination } from "../logic/entry-destination";
import {
  listRoomCreationIntents,
  notifyRoomCreations,
  type RoomCreationIntent,
  readRoomCreationIntent,
  saveRoomCreationResult,
  subscribeRoomCreations,
} from "../logic/room-creation-storage";
import {
  ReturnRoomSectionView,
  type ReturnRoomStatus,
} from "../templates/return-room-section-view";
import { RoomReauthentication } from "./room-reauthentication";

export function ReturnRoomSection({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const router = useRouter();
  const [reauthRoom, setReauthRoom] = useState<string>();
  const [candidate, setCandidate] = useState<{
    userId: string;
    roomId: string | null;
  } | null>(null);
  const [records, setRecords] = useState<RoomCreationIntent[]>([]);
  const [status, setStatus] = useState<ReturnRoomStatus>("idle");
  const [historyMessage, setHistoryMessage] = useState<string>();
  const actor = useRef(currentUserId);
  actor.current = currentUserId;
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    let live = true;
    let lastRoom = readLastRoom(currentUserId);
    let fallbackRoom: string | null = null;
    let recordRead = 0;
    const turn = ++generation.current;
    pending.current = false;
    setRecords([]);
    setHistoryMessage(undefined);
    setCandidate({ userId: currentUserId, roomId: lastRoom });
    setStatus(lastRoom ? "checking" : "idle");
    const current = (expectedTurn: number) =>
      live &&
      actor.current === currentUserId &&
      generation.current === expectedTurn;
    async function inspect(roomId: string, expectedTurn: number) {
      pending.current = true;
      try {
        const result = await returnToRoom(roomId);
        if (!current(expectedTurn)) return;
        if (result.kind === "ready")
          setStatus(
            result.href.startsWith("/completed-rooms/")
              ? "completed"
              : "active",
          );
        else if (result.kind === "reauth_required") setStatus("active");
        else if (result.kind === "unavailable_room") {
          clearLastRoom(roomId);
          setStatus("unavailable");
        } else setStatus("retry");
      } catch {
        if (current(expectedTurn)) setStatus("retry");
      } finally {
        if (current(expectedTurn)) pending.current = false;
      }
    }
    async function loadRecords(expectedTurn: number) {
      const readTurn = ++recordRead;
      try {
        const active = await readRoomCreationIntent(currentUserId);
        const list = await listRoomCreationIntents(currentUserId);
        if (!current(expectedTurn) || readTurn !== recordRead) return;
        setRecords(list);
        // 直前の参加先を古い作成情報で上書きしない。保存先が失われた場合だけ補完。
        // ユーザーが開き始めた履歴を自動補完で取り消さない。
        if (
          !pending.current &&
          !lastRoom &&
          active?.roomId &&
          active.roomId !== fallbackRoom
        ) {
          fallbackRoom = active.roomId;
          const nextTurn = ++generation.current;
          setCandidate({ userId: currentUserId, roomId: active.roomId });
          setStatus("checking");
          void inspect(active.roomId, nextTurn);
        }
      } catch {
        /* 再訪の記録が読めなくても直前のルームへの導線は維持する。 */
      }
    }
    if (lastRoom) void inspect(lastRoom, turn);
    void loadRecords(turn);
    function refreshStorage(event: StorageEvent) {
      if (event.key !== null && event.key !== LAST_ROOM_STORAGE_KEY) return;
      const roomId = readLastRoom(currentUserId);
      if (roomId === lastRoom) return;
      lastRoom = roomId;
      const nextTurn = ++generation.current;
      pending.current = false;
      setCandidate({ userId: currentUserId, roomId });
      setStatus(roomId ? "checking" : "idle");
      if (roomId) void inspect(roomId, nextTurn);
      void loadRecords(nextTurn);
    }
    const unsubscribe = subscribeRoomCreations(() => {
      const roomId = readLastRoom(currentUserId);
      if (roomId !== lastRoom)
        refreshStorage(
          new StorageEvent("storage", { key: LAST_ROOM_STORAGE_KEY }),
        );
      else void loadRecords(generation.current);
    });
    window.addEventListener("storage", refreshStorage);
    return () => {
      live = false;
      generation.current++;
      unsubscribe();
      window.removeEventListener("storage", refreshStorage);
    };
  }, [currentUserId]);

  async function open(record?: RoomCreationIntent) {
    if (pending.current || (candidate?.userId !== currentUserId && !record))
      return;
    const principal = currentUserId,
      turn = generation.current;
    const storedRoom = readLastRoom(principal);
    const current = () =>
      actor.current === principal &&
      generation.current === turn &&
      readLastRoom(principal) === storedRoom;
    let roomId = record?.roomId ?? (record ? null : candidate?.roomId);
    if (
      (!roomId && !record) ||
      (record?.expectedPrincipal !== principal && record)
    )
      return;
    const previousStatus = status;
    pending.current = true;
    setStatus("checking");
    setHistoryMessage(undefined);
    try {
      if (!roomId && record) {
        const result = await queryRoomCreation(principal, record.requestId);
        if (!current()) return;
        if (!result.ok || result.status.kind !== "ready") {
          setStatus(previousStatus);
          setHistoryMessage(
            result.ok && result.status.kind === "closed"
              ? "このルームには戻れません。"
              : "前のルームを確認できませんでした。後でもう一度お試しください。",
          );
          return;
        }
        roomId = result.status.roomId;
        await saveRoomCreationResult(principal, record, roomId);
        if (!current()) return;
      }
      if (!roomId) return;
      const result = await returnToRoom(roomId);
      if (!current()) return;
      if (result.kind === "reauth_required") {
        setReauthRoom(roomId);
        setStatus(previousStatus);
        return;
      }
      if (result.kind === "ready") {
        setStatus(
          result.href.startsWith("/completed-rooms/") ? "completed" : "active",
        );
        router.push(
          await entryDestination(result.href, roomId, result.entryToken),
        );
        rememberLastRoom(principal, roomId);
        // 移動中の同タブには新しいServer Actionを起こさず、別タブだけに通知。
        notifyRoomCreations(false);
      } else if (result.kind === "unavailable_room") {
        if (!record) clearLastRoom(roomId);
        setStatus(record ? previousStatus : "unavailable");
        if (record) setHistoryMessage("このルームには戻れません。");
      } else {
        setStatus(record ? previousStatus : "retry");
        if (record)
          setHistoryMessage(
            "ルームを開けませんでした。もう一度お試しください。",
          );
      }
    } catch {
      if (current()) {
        setStatus(record ? previousStatus : "retry");
        if (record)
          setHistoryMessage(
            "ルームを開けませんでした。もう一度お試しください。",
          );
      }
    } finally {
      if (actor.current === principal && generation.current === turn)
        pending.current = false;
    }
  }
  const roomId = candidate?.userId === currentUserId ? candidate.roomId : null;
  const previous = records.filter(
    (record) =>
      record.expectedPrincipal === currentUserId &&
      record.state !== "prepared" &&
      record.state !== "closed" &&
      (!roomId || record.roomId !== roomId),
  );
  if (!roomId && !previous.length) return null;
  return (
    <>
      <ReturnRoomSectionView
        status={status}
        hasCandidate={Boolean(roomId)}
        onConfirm={() => {
          void open();
        }}
        historyMessage={historyMessage}
        previousRooms={previous.map((record) => ({
          id: record.requestId,
          label: `${record.roomId ? "以前のルームを開く" : "以前のルームを探す"}${record.name ? `：${record.name}` : record.issuedAt > 0 ? `（${new Date(record.issuedAt).toLocaleString("ja-JP")}）` : ""}`,
        }))}
        onOpenPrevious={(id) => {
          const record = previous.find((record) => record.requestId === id);
          if (record) void open(record);
        }}
      />
      {reauthRoom && (
        <RoomReauthentication
          operation={{ kind: "return", roomId: reauthRoom }}
          onBack={() => setReauthRoom(undefined)}
        />
      )}
    </>
  );
}

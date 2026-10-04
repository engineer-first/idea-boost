"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  clearLastRoom,
  LAST_ROOM_STORAGE_KEY,
  readLastRoom,
} from "@/lib/room-client/last-room-storage";
import { returnToRoom } from "../logic/actions";
import {
  ReturnRoomSectionView,
  type ReturnRoomStatus,
} from "../templates/return-room-section-view";
export function ReturnRoomSection({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const router = useRouter();
  const [candidate, setCandidate] = useState<{
    userId: string;
    roomId: string | null;
  } | null>(null);
  const [status, setStatus] = useState<ReturnRoomStatus>("idle");
  const generationRef = useRef(0);
  const pendingRef = useRef(false);
  useEffect(() => {
    let lastRoomId = readLastRoom(currentUserId);
    generationRef.current += 1;
    pendingRef.current = false;
    setCandidate({ userId: currentUserId, roomId: lastRoomId });
    setStatus("idle");
    function refresh(event: StorageEvent): void {
      if (event.key !== null && event.key !== LAST_ROOM_STORAGE_KEY) return;
      const roomId = readLastRoom(currentUserId);
      if (roomId === lastRoomId) return;
      lastRoomId = roomId;
      generationRef.current += 1;
      pendingRef.current = false;
      setCandidate({ userId: currentUserId, roomId });
      setStatus("idle");
    }
    window.addEventListener("storage", refresh);
    return () => {
      generationRef.current += 1;
      window.removeEventListener("storage", refresh);
    };
  }, [currentUserId]);
  async function confirm(): Promise<void> {
    if (
      pendingRef.current ||
      !candidate?.roomId ||
      candidate.userId !== currentUserId
    )
      return;
    const roomId = candidate.roomId;
    if (readLastRoom(currentUserId) !== roomId) return;
    pendingRef.current = true;
    setStatus("checking");
    const generation = generationRef.current;
    try {
      const result = await returnToRoom(roomId);
      if (
        generation !== generationRef.current ||
        readLastRoom(currentUserId) !== roomId
      )
        return;
      if (result.kind === "ready") {
        router.push(result.href);
        return;
      }
      if (result.kind === "unavailable_room") {
        clearLastRoom(roomId);
        setStatus("unavailable");
      } else setStatus("retry");
    } catch {
      if (
        generation === generationRef.current &&
        readLastRoom(currentUserId) === roomId
      )
        setStatus("retry");
    } finally {
      if (generation === generationRef.current) pendingRef.current = false;
    }
  }
  if (!candidate?.roomId || candidate.userId !== currentUserId) return null;
  return (
    <ReturnRoomSectionView
      status={status}
      onConfirm={() => {
        void confirm();
      }}
    />
  );
}

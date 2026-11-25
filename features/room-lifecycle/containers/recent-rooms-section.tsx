"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type RecentRoom,
  RecentRoomsResponseSchema,
} from "@/contracts/recent-rooms";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import { returnToRoom } from "../logic/actions";
import { entryDestination } from "../logic/entry-destination";
import { GUEST_IDENTITY_UNAVAILABLE_MESSAGE } from "../logic/guest-identity-message";
import { RecentRoomsSectionView } from "../templates/recent-rooms-section-view";
import { RoomReauthentication } from "./room-reauthentication";

type Load =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; rooms: RecentRoom[] };

// Googleでログインした本人の、アカウント単位の参加の記録から最近のルームを出す。
// 端末の保存領域ではなくサーバーの記録を読むので、別の端末で入ったルームにも戻れる。
export function RecentRoomsSection({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState<string>();
  const [reauthRoom, setReauthRoom] = useState<string>();
  const actor = useRef(currentUserId);
  actor.current = currentUserId;

  const fetchRooms = useCallback(async (principal: string) => {
    setLoad({ kind: "loading" });
    try {
      const response = await fetch("/api/recent-rooms", { cache: "no-store" });
      const parsed = RecentRoomsResponseSchema.safeParse(
        response.ok ? await response.json().catch(() => null) : null,
      );
      if (actor.current !== principal) return;
      setLoad(
        parsed.success
          ? { kind: "ready", rooms: parsed.data.rooms }
          : { kind: "failed" },
      );
    } catch {
      if (actor.current === principal) setLoad({ kind: "failed" });
    }
  }, []);
  useEffect(() => {
    setMessage(undefined);
    setOpening(false);
    void fetchRooms(currentUserId);
  }, [currentUserId, fetchRooms]);

  async function openActive(roomId: string) {
    if (opening) return;
    const principal = currentUserId;
    setOpening(true);
    setMessage(undefined);
    try {
      const result = await returnToRoom(roomId, principal);
      if (actor.current !== principal) return;
      if (result.kind === "ready") {
        router.push(
          await entryDestination(result.href, roomId, result.entryToken),
        );
        rememberLastRoom(principal, roomId);
        return;
      }
      if (result.kind === "reauth_required") setReauthRoom(roomId);
      else if (result.kind === "identity_unavailable")
        setMessage(GUEST_IDENTITY_UNAVAILABLE_MESSAGE);
      else if (result.kind === "unavailable_room")
        setMessage("このルームには戻れません。");
      else setMessage("ルームを開けませんでした。もう一度お試しください。");
    } catch {
      if (actor.current === principal)
        setMessage("ルームを開けませんでした。もう一度お試しください。");
    } finally {
      if (actor.current === principal) setOpening(false);
    }
  }

  if (load.kind === "loading") return null;
  if (load.kind === "ready" && !load.rooms.length) return null;
  return (
    <>
      <RecentRoomsSectionView
        rooms={load.kind === "ready" ? load.rooms : []}
        loadFailed={load.kind === "failed"}
        opening={opening}
        message={message}
        onOpenActive={(roomId) => {
          void openActive(roomId);
        }}
        onRetry={() => {
          void fetchRooms(currentUserId);
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

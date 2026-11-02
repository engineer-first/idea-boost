"use client";

import { useEffect, useRef, useState } from "react";
import {
  type GuestRoomEntryResult,
  refreshGuestRoomEntry,
} from "@/features/auth";
import { GuestEntryRefreshView } from "../templates/guest-entry-refresh-view";
import { RoomReauthentication } from "./room-reauthentication";

export type GuestEntryRefreshProps = {
  roomId: string;
  onRefreshed?: () => void;
  refreshAction?: (roomId: string) => Promise<GuestRoomEntryResult>;
};

function reloadPage(): void {
  window.location.reload();
}

export function GuestEntryRefresh({
  roomId,
  onRefreshed = reloadPage,
  refreshAction = refreshGuestRoomEntry,
}: GuestEntryRefreshProps) {
  const [result, setResult] = useState<GuestRoomEntryResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef<{
    attempt: number;
    promise: Promise<GuestRoomEntryResult>;
  } | null>(null);
  const refreshed = useRef(false);
  useEffect(() => {
    let active = true;
    // StrictModeの再実行でもCookie更新要求を共有する。
    if (request.current?.attempt !== attempt) {
      request.current = {
        attempt,
        promise: refreshAction(roomId).catch(() => ({
          ok: false,
          reason: "retry",
        })),
      };
    }
    void request.current.promise.then((value) => {
      if (!active) return;
      setResult(value);
      if (value.ok && !refreshed.current) {
        refreshed.current = true;
        onRefreshed();
      }
    });
    return () => {
      active = false;
    };
  }, [attempt, onRefreshed, refreshAction, roomId]);
  if (result && !result.ok && result.reason === "reauth_required")
    return <RoomReauthentication operation={{ kind: "return", roomId }} />;
  return (
    <GuestEntryRefreshView
      state={
        result && !result.ok && result.reason === "identity_unavailable"
          ? "identity_unavailable"
          : result && !result.ok && result.reason === "retry"
            ? "retry"
            : "checking"
      }
      onRetry={() => {
        setResult(null);
        setAttempt((value) => value + 1);
      }}
    />
  );
}

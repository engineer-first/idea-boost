"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CompletedRoomSummary,
  CompletedRoomsResponseSchema,
} from "@/contracts/completed-rooms";
import { CompletedRoomsView } from "./completed-rooms-view";
export function CompletedRooms() {
  const [rooms, setRooms] = useState<CompletedRoomSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const failedCursor = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (next: string | null) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError(null);
    failedCursor.current = next;
    try {
      const response = await fetch(
        `/api/completed-rooms${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
        { cache: "no-store", signal: request.signal },
      );
      if (request.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 404) setRooms([]);
        throw new Error(
          response.status === 401
            ? "ログインし直してから再取得してください。"
            : "以前のルームを取得できませんでした。",
        );
      }
      const result = CompletedRoomsResponseSchema.parse(await response.json());
      if (request.signal.aborted) return;
      setRooms((previous) =>
        next
          ? [
              ...previous,
              ...result.rooms.filter(
                (room) => !previous.some((p) => p.roomId === room.roomId),
              ),
            ]
          : result.rooms,
      );
      setCursor(result.nextCursor);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof Error && cause.message.startsWith("ログイン")
            ? cause.message
            : "以前のルームを取得できませんでした。再取得をお試しください。",
        );
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(null);
    return () => controller.current?.abort();
  }, [load]);
  return (
    <CompletedRoomsView
      rooms={rooms}
      loading={loading}
      error={error}
      hasMore={cursor !== null}
      onRetry={() => void load(failedCursor.current)}
      onMore={() => void load(cursor)}
    />
  );
}

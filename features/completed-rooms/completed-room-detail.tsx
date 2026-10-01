"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CompletedBoardResponse,
  CompletedBoardResponseSchema,
  type CompletedRoom,
  CompletedRoomSchema,
  type CompletedSceneKind,
} from "@/contracts/completed-rooms";
import { submitFeedback, useFeedback } from "@/features/feedback";
import { CompletedRoomDetailView } from "./completed-room-detail-view";
export function CompletedRoomDetail({ roomId }: { roomId: string }) {
  const feedback = useFeedback(roomId, submitFeedback);
  const [room, setRoom] = useState<CompletedRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] =
    useState<CompletedSceneKind>("problem-grouping");
  const [scene, setScene] = useState<CompletedBoardResponse | null>(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [retry, setRetry] = useState({ roomId });
  const detailController = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    detailController.current?.abort();
    const request = new AbortController();
    detailController.current = request;
    setLoading(true);
    setError(null);
    setRoom(null);
    setScene(null);
    try {
      const response = await fetch(
        `/api/completed-rooms/${encodeURIComponent(roomId)}`,
        { cache: "no-store", signal: request.signal },
      );
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "この成果は表示できません。閲覧期限とログインしているアカウントを確認してください。"
            : response.status === 401
              ? "ログインし直してから再取得してください。"
              : "成果を取得できませんでした。再取得をお試しください。",
        );
      const data = CompletedRoomSchema.parse(await response.json());
      if (!request.signal.aborted) setRoom(data);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "成果を取得できませんでした。",
        );
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [roomId]);
  useEffect(() => {
    void load();
    return () => detailController.current?.abort();
  }, [load]);
  useEffect(() => {
    if (!expanded || !room) return;
    if (retry.roomId !== roomId) return;
    const request = new AbortController();
    setScene(null);
    setSceneLoading(true);
    setSceneError(null);
    void (async () => {
      try {
        const response = await fetch(
          `/api/completed-rooms/${encodeURIComponent(roomId)}/scenes/${selected}`,
          { cache: "no-store", signal: request.signal },
        );
        if (request.signal.aborted) return;
        if (!response.ok) {
          if (response.status === 401 || response.status === 404) {
            setRoom(null);
            setError(
              "この成果は表示できません。閲覧期限とログインしているアカウントを確認してください。",
            );
          }
          throw new Error();
        }
        const data = CompletedBoardResponseSchema.parse(await response.json());
        if (
          data.scene.kind !== selected ||
          (data.board && data.board.kind !== selected)
        )
          throw new Error();
        if (!request.signal.aborted) setScene(data);
      } catch {
        if (!request.signal.aborted)
          setSceneError(
            "場面を取得できませんでした。場面を再取得してください。",
          );
      } finally {
        if (!request.signal.aborted) setSceneLoading(false);
      }
    })();
    return () => request.abort();
  }, [roomId, selected, expanded, room, retry]);
  return (
    <CompletedRoomDetailView
      feedback={feedback}
      room={room}
      loading={loading}
      error={error}
      expanded={expanded}
      selected={selected}
      scene={scene}
      sceneLoading={sceneLoading}
      sceneError={sceneError}
      onRetry={() => void load()}
      onToggle={() => setExpanded((value) => !value)}
      onSelect={(kind) => {
        setScene(null);
        setSceneLoading(true);
        setSelected(kind);
      }}
      onSceneRetry={() => setRetry({ roomId })}
    />
  );
}

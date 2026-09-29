import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ProgressHistoryEntry,
  type ProgressHistoryRecord,
  ProgressHistoryRecordSchema,
  ProgressHistoryResponseSchema,
} from "@/contracts/shared-outcomes";
import type { ProgressHistoryViewProps } from "./progress-history-view";

class HistoryFetchError extends Error {
  constructor(readonly status: number) {
    super("history fetch failed");
  }
}
function accessError(cause: unknown): string | null {
  if (!(cause instanceof HistoryFetchError)) return null;
  if (cause.status === 401 || cause.status === 403)
    return "共有成果の閲覧権限を確認できません。ログイン状態と権限を確認してください。";
  if (cause.status === 404)
    return "この記録は存在しないか、保存期間が終了しました。";
  return null;
}
export function useProgressHistory(
  roomId: string | undefined,
  onDenied: (message: string) => void,
): ProgressHistoryViewProps {
  const listRequest = useRef(0);
  const recordRequest = useRef(0);
  const [entries, setEntries] = useState<ProgressHistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProgressHistoryEntry | null>(null);
  const [record, setRecord] = useState<ProgressHistoryRecord | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const fetchData = useCallback(
    async (path: string): Promise<unknown> => {
      if (!roomId) throw new Error("room required");
      const response = await fetch(
        `/api/shared-outcomes/${encodeURIComponent(roomId)}/history${path}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new HistoryFetchError(response.status);
      return response.json();
    },
    [roomId],
  );
  const load = useCallback(
    async (cursor?: string) => {
      if (!roomId) return;
      const request = ++listRequest.current;
      setLoading(true);
      setError(null);
      try {
        const result = ProgressHistoryResponseSchema.parse(
          await fetchData(
            cursor ? `?cursor=${encodeURIComponent(cursor)}` : "",
          ),
        );
        if (request !== listRequest.current) return;
        setEntries((previous) =>
          cursor ? [...previous, ...result.entries] : result.entries,
        );
        setNextCursor(result.nextCursor);
      } catch (cause) {
        if (request !== listRequest.current) return;
        const denied = accessError(cause);
        if (denied) onDenied(denied);
        if (request === listRequest.current)
          setError(
            "進行の記録を取得できませんでした。記録の消失を示すものではありません。",
          );
      } finally {
        if (request === listRequest.current) setLoading(false);
      }
    },
    [fetchData, roomId, onDenied],
  );
  const open = useCallback(
    async (entry: ProgressHistoryEntry) => {
      const request = ++recordRequest.current;
      setSelected(entry);
      setRecord(null);
      setRecordError(null);
      setRecordLoading(true);
      try {
        const result = ProgressHistoryRecordSchema.parse(
          await fetchData(`/${encodeURIComponent(entry.id)}`),
        );
        if (request !== recordRequest.current) return;
        setRecord(result);
        setSelected(result);
        setEntries((previous) =>
          previous.map((item) => (item.id === result.id ? result : item)),
        );
      } catch (cause) {
        if (request !== recordRequest.current) return;
        const denied = accessError(cause);
        if (denied) onDenied(denied);
        if (request === recordRequest.current)
          setRecordError(
            "盤面を取得できませんでした。記録の消失を示すものではありません。",
          );
      } finally {
        if (request === recordRequest.current) setRecordLoading(false);
      }
    },
    [fetchData, onDenied],
  );
  useEffect(() => {
    setLoading(false);
    setError(null);
    setRecordLoading(false);
    setEntries([]);
    setNextCursor(null);
    setSelected(null);
    setRecord(null);
    setRecordError(null);
    void load();
    return () => {
      listRequest.current++;
      recordRequest.current++;
    };
  }, [load]);
  return {
    entries,
    nextCursor,
    loading,
    error,
    selected,
    record,
    recordLoading,
    recordError,
    onOpen: (entry) => void open(entry),
    onMore: () => {
      if (nextCursor) void load(nextCursor);
    },
    onRefresh: () => {
      void load();
      if (selected) void open(selected);
    },
    onRetry: () => {
      if (selected) void open(selected);
    },
  };
}

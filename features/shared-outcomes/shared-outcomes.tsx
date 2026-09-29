"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type SharedOutcomeRecord,
  SharedOutcomeRecordSchema,
  type SharedOutcomeSummary,
  SharedOutcomesResponseSchema,
} from "@/contracts/shared-outcomes";
import { SharedOutcomesView } from "./shared-outcomes-view";
import { useProgressHistory } from "./use-progress-history";

export function SharedOutcomes() {
  const requestNumber = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<SharedOutcomeSummary[]>([]);
  const [detail, setDetail] = useState<SharedOutcomeRecord | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const onDenied = useCallback((message: string) => {
    requestNumber.current++;
    setLoading(false);
    setDetail(null);
    setOutcomes([]);
    setError(message);
  }, []);
  const history = useProgressHistory(detail?.roomId, onDenied);
  const load = useCallback(async (id?: string, cursor?: string) => {
    const request = ++requestNumber.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/shared-outcomes${id ? `/${encodeURIComponent(id)}` : cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "ログインしてください。"
            : response.status === 403
              ? "共有成果の閲覧権限がありません。"
              : response.status === 404
                ? "この成果は存在しないか、保存期間が終了しました。"
                : "成果を取得できませんでした。時間をおいて再度お試しください。",
        );
      const body: unknown = await response.json();
      if (request !== requestNumber.current) return;
      if (id) setDetail(SharedOutcomeRecordSchema.parse(body));
      else {
        const result = SharedOutcomesResponseSchema.parse(body);
        setOutcomes((previous) =>
          cursor ? [...previous, ...result.outcomes] : result.outcomes,
        );
        setNextCursor(result.nextCursor);
        setDetail(null);
      }
    } catch (cause) {
      if (request !== requestNumber.current) return;
      setDetail(null);
      setOutcomes([]);
      setNextCursor(null);
      setError(
        cause instanceof Error && !(cause.name === "ZodError")
          ? cause.message
          : "成果を取得できませんでした。再度お試しください。",
      );
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const roomId = new URL(window.location.href).searchParams.get("roomId");
    void load(roomId ?? undefined);
    return () => {
      requestNumber.current++;
    };
  }, [load]);
  return (
    <SharedOutcomesView
      history={history}
      loading={loading}
      error={error}
      outcomes={outcomes}
      detail={detail}
      nextCursor={nextCursor}
      onOpen={(id) => void load(id)}
      onBack={() => void load()}
      onRefresh={() => {
        void load(detail?.roomId);
        if (detail) history.onRefresh();
      }}
      onMore={() => nextCursor && void load(undefined, nextCursor)}
    />
  );
}

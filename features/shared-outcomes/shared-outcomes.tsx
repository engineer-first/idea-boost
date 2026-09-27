"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type SharedOutcomeRecord,
  SharedOutcomeRecordSchema,
  type SharedOutcomeSummary,
  SharedOutcomesResponseSchema,
} from "@/contracts/shared-outcomes";
import { SharedOutcomesView } from "./shared-outcomes-view";

export function SharedOutcomes() {
  const token = useRef("");
  const requestNumber = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<SharedOutcomeSummary[]>([]);
  const [detail, setDetail] = useState<SharedOutcomeRecord | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const load = useCallback(async (id?: string, cursor?: string) => {
    const request = ++requestNumber.current;
    setLoading(true);
    setError(null);
    try {
      if (!token.current)
        throw new Error(
          "秘密リンクから開いてください。リンクが無効化されている場合は管理者へお問い合わせください。",
        );
      const response = await fetch(
        `/api/shared-outcomes${id ? `/${encodeURIComponent(id)}` : cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        {
          headers: { Authorization: `Bearer ${token.current}` },
          cache: "no-store",
          referrerPolicy: "no-referrer",
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? "この秘密リンクでは閲覧できません。管理者へ有効なリンクをご確認ください。"
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
    token.current =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    void load();
    return () => {
      requestNumber.current++;
    };
  }, [load]);
  return (
    <SharedOutcomesView
      loading={loading}
      error={error}
      outcomes={outcomes}
      detail={detail}
      nextCursor={nextCursor}
      onOpen={(id) => void load(id)}
      onBack={() => void load()}
      onRefresh={() => void load(detail?.roomId)}
      onMore={() => nextCursor && void load(undefined, nextCursor)}
    />
  );
}

"use client";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { FeedbackListSchema, type FeedbackRecord } from "@/contracts/feedback";
import { type FeedbackFilters, FeedbackListView } from "./feedback-list-view";
export function FeedbackList(): ReactElement {
  const [filters, setFilters] = useState<FeedbackFilters>({
    kind: "",
    target: "",
    from: "",
    to: "",
  });
  const [items, setItems] = useState<FeedbackRecord[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [retryCursor, setRetryCursor] = useState<string | null>(null),
    [canReadOutcomes, setCanReadOutcomes] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(
    async (next?: string) => {
      const ticket = ++sequence.current;
      setLoading(true);
      setError(null);
      setRetryCursor(null);
      let keepLoadedItems = Boolean(next);
      if (!next) {
        setItems([]);
        setCursor(null);
      }
      try {
        const params = new URLSearchParams();
        if (filters.kind) params.set("kind", filters.kind);
        if (filters.target) params.set("target", filters.target);
        for (const name of ["from", "to"] as const) {
          const timestamp = new Date(filters[name]).getTime();
          if (Number.isFinite(timestamp)) params.set(name, String(timestamp));
        }
        if (next) params.set("cursor", next);
        const response = await fetch(
          `/api/feedback${params.size ? `?${params}` : ""}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          keepLoadedItems = Boolean(next) && response.status >= 500;
          throw new Error(
            response.status === 401
              ? "ログインしてください。"
              : response.status === 403
                ? "意見の閲覧権限がありません。"
                : response.status === 400
                  ? "絞り込み条件を確認してください。"
                  : "意見を取得できませんでした。再試行してください。",
          );
        }
        const result = FeedbackListSchema.parse(await response.json());
        if (ticket !== sequence.current) return;
        setItems((previous) => {
          const merged = next ? [...previous, ...result.items] : result.items;
          return Array.from(
            new Map(
              merged
                .filter((item) => item.expiresAt > Date.now())
                .map((item) => [item.id, item]),
            ).values(),
          );
        });
        setCursor(result.nextCursor);
        setCanReadOutcomes(result.canReadOutcomes);
      } catch (cause) {
        if (ticket === sequence.current) {
          if (
            keepLoadedItems &&
            !(cause instanceof Error && cause.name === "ZodError")
          ) {
            setItems((previous) =>
              previous.filter((item) => item.expiresAt > Date.now()),
            );
            setRetryCursor(next ?? null);
          } else {
            setItems([]);
            setCursor(null);
            setCanReadOutcomes(false);
          }
          setError(
            cause instanceof Error &&
              cause.name !== "ZodError" &&
              cause.name !== "TypeError"
              ? cause.message
              : "意見を取得できませんでした。再試行してください。",
          );
        }
      } finally {
        if (ticket === sequence.current) setLoading(false);
      }
    },
    [filters],
  );
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!items.length) return;
    const wait = Math.max(
      0,
      Math.min(...items.map((i) => i.expiresAt)) - Date.now(),
    );
    const timer = setTimeout(
      () =>
        setItems((previous) =>
          previous.filter((item) => item.expiresAt > Date.now()),
        ),
      Math.min(wait + 1, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [items]);
  return (
    <FeedbackListView
      items={items}
      filters={filters}
      loading={loading}
      error={error}
      nextCursor={cursor}
      canReadOutcomes={canReadOutcomes}
      onFilter={(patch) => setFilters((value) => ({ ...value, ...patch }))}
      onRefresh={() => void load()}
      onRetry={() => void load(retryCursor ?? undefined)}
      onMore={() => {
        if (cursor) void load(cursor);
      }}
    />
  );
}

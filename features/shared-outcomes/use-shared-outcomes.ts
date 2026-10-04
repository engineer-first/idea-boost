"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type SharedOutcomeFilters,
  type SharedOutcomeRecord,
  SharedOutcomeRecordSchema,
  type SharedOutcomeSummary,
  SharedOutcomesResponseSchema,
} from "@/contracts/shared-outcomes";
import {
  DEFAULT_OUTCOME_FILTERS,
  outcomeHref,
  outcomeParams,
  readOutcomeFilters,
} from "./shared-outcomes-query";
import { useProgressHistory } from "./use-progress-history";

class OutcomeFetchError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "ログインしてください。"
        : status === 403
          ? "共有成果の閲覧権限がありません。"
          : status === 404
            ? "この成果は存在しないか、保存期間が終了しました。"
            : "成果を取得できませんでした。時間をおいて再度お試しください。",
    );
  }
}
type LoadTask = {
  roomId?: string;
  filters: SharedOutcomeFilters;
  more?: string;
  pages?: number;
};
export function useSharedOutcomes() {
  const mainRef = useRef<HTMLElement>(null);
  const requestNumber = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const active = useRef(false);
  const pageCount = useRef(1);
  const listPosition = useRef({ top: 0, roomId: "" });
  const restoreList = useRef(false);
  const focusDetail = useRef(false);
  const retryTask = useRef<LoadTask>({ filters: DEFAULT_OUTCOME_FILTERS });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<SharedOutcomeSummary[]>([]);
  const [detail, setDetail] = useState<SharedOutcomeRecord | null>(null);
  const [roomId, setRoomId] = useState<string | undefined>();
  const [filters, setFilters] = useState(DEFAULT_OUTCOME_FILTERS);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const onDenied = useCallback((message: string) => {
    requestNumber.current++;
    abort.current?.abort();
    active.current = false;
    setLoading(false);
    setLoadingMore(false);
    setDetail(null);
    setOutcomes([]);
    setNextCursor(null);
    pageCount.current = 1;
    setError(message);
  }, []);
  const history = useProgressHistory(detail?.roomId, onDenied);
  const load = useCallback(
    async (task: LoadTask): Promise<void> => {
      const request = ++requestNumber.current;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      active.current = true;
      retryTask.current = task;
      setLoading(!task.more);
      setLoadingMore(Boolean(task.more));
      setError(null);
      async function fetchData(path: string): Promise<unknown> {
        const response = await fetch(path, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new OutcomeFetchError(response.status);
        return response.json();
      }
      try {
        if (task.roomId) {
          const record = SharedOutcomeRecordSchema.parse(
            await fetchData(
              `/api/shared-outcomes/${encodeURIComponent(task.roomId)}`,
            ),
          );
          if (request !== requestNumber.current) return;
          setDetail(record);
        } else {
          let cursor: string | null | undefined = task.more;
          const records: SharedOutcomeSummary[] = [];
          let pages = 0;
          do {
            const params = outcomeParams(task.filters);
            if (cursor) params.set("cursor", cursor);
            const result = SharedOutcomesResponseSchema.parse(
              await fetchData(
                `/api/shared-outcomes${params.size ? `?${params}` : ""}`,
              ),
            );
            if (request !== requestNumber.current) return;
            records.push(...result.outcomes);
            cursor = result.nextCursor;
            pages++;
          } while (!task.more && cursor && pages < (task.pages ?? 1));
          setOutcomes((previous) => [
            ...new Map(
              (task.more ? [...previous, ...records] : records).map(
                (record) => [record.roomId, record],
              ),
            ).values(),
          ]);
          pageCount.current = task.more ? pageCount.current + 1 : pages;
          setNextCursor(cursor ?? null);
          setDetail(null);
        }
      } catch (cause) {
        if (request !== requestNumber.current || controller.signal.aborted)
          return;
        if (
          cause instanceof OutcomeFetchError &&
          (cause.status === 401 || cause.status === 403)
        ) {
          onDenied(cause.message);
          return;
        }
        setError(
          cause instanceof OutcomeFetchError
            ? cause.message
            : "成果を取得できませんでした。通信を確認して再試行してください。",
        );
      } finally {
        if (request === requestNumber.current) {
          active.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [onDenied],
  );
  useEffect(() => {
    function navigate(): void {
      const params = new URL(window.location.href).searchParams;
      const selected = params.get("roomId") ?? undefined;
      const query = readOutcomeFilters(params);
      setRoomId(selected);
      setFilters(query);
      setDetail(null);
      setError(null);
      restoreList.current = !selected;
      focusDetail.current = Boolean(selected);
      void load({
        roomId: selected,
        filters: query,
        pages: selected ? undefined : pageCount.current,
      });
    }
    navigate();
    window.addEventListener("popstate", navigate);
    return () => {
      window.removeEventListener("popstate", navigate);
      requestNumber.current++;
      abort.current?.abort();
    };
  }, [load]);
  useLayoutEffect(() => {
    if (loading) return;
    if (!roomId && restoreList.current) {
      restoreList.current = false;
      const link = mainRef.current?.querySelector<HTMLAnchorElement>(
        `a[data-room-id="${listPosition.current.roomId}"]`,
      );
      link?.focus({ preventScroll: true });
      if (mainRef.current) mainRef.current.scrollTop = listPosition.current.top;
    } else if (roomId && focusDetail.current) {
      focusDetail.current = false;
      mainRef.current?.querySelector("h1")?.focus({ preventScroll: true });
      if (mainRef.current) mainRef.current.scrollTop = 0;
    }
  }, [loading, roomId]);
  function open(id: string, replace = false): void {
    if (!roomId)
      listPosition.current = {
        top: mainRef.current?.scrollTop ?? 0,
        roomId: id,
      };
    const state = {
      ...window.history.state,
      sharedOutcomeFromList:
        !roomId || window.history.state?.sharedOutcomeFromList === true,
    };
    window.history[replace ? "replaceState" : "pushState"](
      state,
      "",
      outcomeHref(filters, id),
    );
    setRoomId(id);
    setDetail(null);
    focusDetail.current = true;
    if (mainRef.current) mainRef.current.scrollTop = 0;
    void load({ roomId: id, filters });
  }
  function back(): void {
    if (window.history.state?.sharedOutcomeFromList) {
      window.history.back();
      return;
    }
    window.history.replaceState(window.history.state, "", outcomeHref(filters));
    setRoomId(undefined);
    setDetail(null);
    restoreList.current = true;
    void load({ filters, pages: pageCount.current });
  }
  function search(query: SharedOutcomeFilters): void {
    const normalized = { ...query, q: query.q.trim() };
    window.history.replaceState(
      window.history.state,
      "",
      outcomeHref(normalized),
    );
    setFilters(normalized);
    setOutcomes([]);
    setNextCursor(null);
    pageCount.current = 1;
    listPosition.current = { top: 0, roomId: "" };
    if (mainRef.current) mainRef.current.scrollTop = 0;
    void load({ filters: normalized });
  }
  return {
    paginationError: Boolean(
      error && retryTask.current.more && outcomes.length > 0,
    ),
    mainRef,
    history,
    loading,
    loadingMore,
    error,
    outcomes,
    detail,
    roomId,
    filters,
    nextCursor,
    onOpen: open,
    onBack: back,
    onSearch: search,
    onRefresh: () => {
      void load({ roomId, filters, pages: pageCount.current });
      if (detail) history.onRefresh();
    },
    onRetry: () => void load(retryTask.current),
    onMore: () => {
      if (nextCursor && !active.current)
        void load({ filters, more: nextCursor });
    },
    onAdjacent: (id: string) => open(id, true),
  };
}

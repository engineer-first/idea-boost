"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DemoAction,
  type DemoStatus,
  DemoStatusSchema,
} from "@/contracts/demo";
import { DEMO_REQUEST_ERROR, demoRequest } from "./demo-client";

export function useDemoPanel(roomId: string, initialStatus: DemoStatus) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<DemoStatus>(initialStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionLock = useRef(false);
  const generation = useRef(0);
  const path = `/api/demo/rooms/${roomId}`;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (actionLock.current) return;
      const requestGeneration = ++generation.current;
      try {
        const nextStatus = await demoRequest(
          path,
          DemoStatusSchema,
          undefined,
          signal,
        );
        if (requestGeneration !== generation.current || signal?.aborted) return;
        setStatus(nextStatus);
        setError(null);
      } catch {
        if (requestGeneration === generation.current && !signal?.aborted)
          setError(DEMO_REQUEST_ERROR);
      }
    },
    [path],
  );

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refresh(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [expanded, refresh]);

  async function action(action: DemoAction): Promise<void> {
    if (
      actionLock.current ||
      status.phase.kind !== "step" ||
      !status.availableActions.includes(action)
    )
      return;
    actionLock.current = true;
    ++generation.current;
    setPending(true);
    setError(null);
    try {
      const nextStatus = await demoRequest(
        `${path}/actions`,
        DemoStatusSchema,
        { action, phase: status.phase.phase, step: status.phase.step },
      );
      setStatus(nextStatus);
    } catch {
      setError(DEMO_REQUEST_ERROR);
    } finally {
      actionLock.current = false;
      setPending(false);
    }
  }
  return {
    expanded,
    toggle: () => setExpanded((value) => !value),
    status,
    pending,
    error,
    action,
    refresh,
  };
}

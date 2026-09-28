"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type VerificationActive,
  VerificationActiveSchema,
  type VerificationCheckpoint,
  type VerificationStatus,
  VerificationStatusSchema,
  VerificationWorkspaceSchema,
} from "@/contracts/verification";
import { verificationRequest } from "./verification-client";

export function useVerification(initialActive: VerificationActive | null) {
  const [active, setActive] = useState(initialActive);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal): Promise<void> => {
    if (locked.current) return;
    const revision = ++generation.current;
    try {
      const next = await verificationRequest(
        "/api/verification/active",
        VerificationWorkspaceSchema,
        undefined,
        signal,
      );
      const nextStatus = next.active
        ? await verificationRequest(
            `/api/verification/rooms/${next.active.roomId}`,
            VerificationStatusSchema,
            undefined,
            signal,
          )
        : null;
      if (revision !== generation.current || signal?.aborted) return;
      setActive(next.active);
      setStatus(nextStatus);
      setError(null);
    } catch {
      if (revision === generation.current && !signal?.aborted)
        setError(
          "検証環境との通信に失敗しました。ログインと接続を確認してください。",
        );
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll(): Promise<void> {
      await refresh(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      ++generation.current;
    };
  }, [refresh]);
  async function mutate(action: () => Promise<void>): Promise<void> {
    if (locked.current) return;
    locked.current = true;
    ++generation.current;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch {
      setError("検証操作に失敗しました。現在のルームを再取得してください。");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  async function create(checkpoint: VerificationCheckpoint): Promise<void> {
    await mutate(async () => {
      const next = await verificationRequest(
        "/api/verification/rooms",
        VerificationActiveSchema,
        { checkpoint },
      );
      setActive(next);
      setStatus(null);
    });
  }
  async function vote(): Promise<void> {
    if (!active || !status?.canCompleteVotes || status.phase.kind !== "step")
      return;
    const { phase, step } = status.phase;
    await mutate(async () => {
      setStatus(
        await verificationRequest(
          `/api/verification/rooms/${active.roomId}/vote`,
          VerificationStatusSchema,
          { phase, step },
        ),
      );
    });
  }
  return { active, status, pending, error, create, vote, refresh };
}

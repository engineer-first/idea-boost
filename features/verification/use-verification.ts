"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type VerificationActive,
  VerificationActiveSchema,
  type VerificationCheckpoint,
  VerificationOutcomeRecoverySchema,
  type VerificationOutcomeScenario,
  VerificationOutcomesLinkSchema,
  type VerificationStatus,
  VerificationStatusSchema,
  VerificationWorkspaceSchema,
} from "@/contracts/verification";
import { verificationRequest } from "./verification-client";

export function useVerification(
  initialActive: VerificationActive | null,
  isOwner: boolean,
) {
  const [roomName, setRoomName] = useState("");
  const [outcomesLink, setOutcomesLink] = useState<string | null>(null);
  const [outcomesLinkPending, setOutcomesLinkPending] = useState(isOwner);
  const [outcomesLinkError, setOutcomesLinkError] = useState(false);
  const getOutcomesLink = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (!isOwner) return;
      setOutcomesLinkPending(true);
      setOutcomesLinkError(false);
      try {
        const result = await verificationRequest(
          "/api/verification/outcomes-link",
          VerificationOutcomesLinkSchema,
          undefined,
          signal,
        );
        if (!signal?.aborted)
          setOutcomesLink(
            `${window.location.origin}/shared-outcomes#token=${result.token}`,
          );
      } catch {
        if (!signal?.aborted) {
          setOutcomesLink(null);
          setOutcomesLinkError(true);
        }
      } finally {
        if (!signal?.aborted) setOutcomesLinkPending(false);
      }
    },
    [isOwner],
  );
  useEffect(() => {
    const controller = new AbortController();
    if (isOwner) void getOutcomesLink(controller.signal);
    else setOutcomesLink(null);
    return () => controller.abort();
  }, [getOutcomesLink, isOwner]);
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
  async function createOutcome(
    scenario: VerificationOutcomeScenario,
  ): Promise<void> {
    await mutate(async () => {
      const next = await verificationRequest(
        "/api/verification/outcomes",
        VerificationActiveSchema,
        { scenario, roomName },
      );
      setActive(next);
      setStatus(null);
    });
  }
  async function recoverOutcome(): Promise<void> {
    if (!active) return;
    await mutate(async () => {
      await verificationRequest(
        `/api/verification/outcomes/${active.roomId}/recover`,
        VerificationOutcomeRecoverySchema,
        {},
      );
    });
  }
  return {
    roomName,
    setRoomName,
    outcomesLink,
    outcomesLinkPending,
    outcomesLinkError,
    createOutcome,
    getOutcomesLink,
    recoverOutcome,
    active,
    status,
    pending,
    error,
    create,
    vote,
    refresh,
  };
}

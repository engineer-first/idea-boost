"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { RoomEntryOperation } from "@/contracts/room-entry";
import type {
  ParticipationConfirmation,
  ParticipationResult,
} from "@/contracts/room-participation";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import {
  createRoom,
  issueRoomCreation,
  queryRoomCreation,
  returnToRoom,
} from "./actions";
import { entryDestination } from "./entry-destination";
import { lifecycleNotify } from "./lifecycle-notify";
import {
  isRoomCreationSelected,
  markRoomCreationSubmitted,
  notifyRoomCreations,
  type RoomCreationIntent,
  readRoomCreationIntent,
  saveRoomCreationIntent,
  saveRoomCreationResult,
  subscribeRoomCreations,
  updateRoomCreationIntent,
  wasRoomCreationOpened,
} from "./room-creation-storage";

const RETRY_MESSAGE = "ルームを開けませんでした。もう一度お試しください。";
export type RoomCreationControls = {
  switching?:
    | ParticipationConfirmation
    | Extract<ParticipationResult, { kind: "pending" | "rejected" }>;
  onCancelSwitch: () => void;
  onSwitchReady: (roomId: string) => Promise<void>;
  reauthentication?: RoomEntryOperation;
  onCancelReauthentication: () => void;
  pending: boolean;
  onSubmit: (name: string) => void;
  intentName?: string;
  message?: string;
};

export function useRoomCreation(currentUserId?: string): RoomCreationControls {
  const router = useRouter();
  const [switching, setSwitching] =
    useState<RoomCreationControls["switching"]>();
  const [reauthentication, setReauthentication] =
    useState<RoomEntryOperation>();
  const [pending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);
  const [submittedName, setSubmittedName] = useState<string>();
  const [intent, setIntent] = useState<RoomCreationIntent | null>(null);
  const [message, setMessage] = useState<string>();
  const [loadedPrincipal, setLoadedPrincipal] = useState<string>();
  const actor = useRef(currentUserId);
  actor.current = currentUserId;
  const generation = useRef(0);
  const submitting = useRef(false);
  const storageAvailable = useRef(true);
  const attempted = useRef<string | undefined>(undefined);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let live = true;
    const turn = ++generation.current;
    storageAvailable.current = true;
    attempted.current = undefined;
    setIntent(null);
    setLoadedPrincipal(undefined);
    setNavigating(false);
    setSubmittedName(undefined);
    setReauthentication(undefined);
    setSwitching(undefined);
    setMessage(undefined);
    let readTurn = 0;
    async function refresh() {
      const read = ++readTurn;
      try {
        const saved = currentUserId
          ? await readRoomCreationIntent(currentUserId)
          : null;
        if (live && turn === generation.current && read === readTurn)
          setIntent(saved);
      } catch {
        // 保存禁止でも、この画面で発行したIDはメモリに保持して再試行する。
        if (live && turn === generation.current)
          storageAvailable.current = false;
      }
      if (live && turn === generation.current && read === readTurn)
        setLoadedPrincipal(currentUserId);
    }
    void refresh();
    const unsubscribe = subscribeRoomCreations(() => {
      if (storageAvailable.current && !submitting.current) void refresh();
    });
    return () => {
      live = false;
      generation.current++;
      unsubscribe();
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
    };
  }, [currentUserId]);

  function handleSubmit(name: string) {
    if (
      submitting.current ||
      navigating ||
      !currentUserId ||
      loadedPrincipal !== currentUserId
    )
      return;
    const principal = currentUserId,
      turn = generation.current;
    const sameActor = () =>
      actor.current === principal && generation.current === turn;
    submitting.current = true;
    setSubmittedName(name);
    setMessage(undefined);
    startTransition(async () => {
      let next = intent;
      let activeRequestId = intent?.requestId ?? null;
      async function persist<T>(
        operation: () => Promise<T>,
        fallback: T,
      ): Promise<T> {
        if (!storageAvailable.current) return fallback;
        try {
          return await operation();
        } catch {
          if (sameActor()) storageAvailable.current = false;
          return fallback;
        }
      }
      const selected = async () => {
        if (!sameActor() || !next) return false;
        const candidate = next;
        const current = await persist(
          () =>
            isRoomCreationSelected(
              principal,
              candidate.requestId,
              candidate.generation,
            ),
          true,
        );
        return current && sameActor();
      };
      try {
        let recoveredDestination:
          | Awaited<ReturnType<typeof returnToRoom>>
          | undefined;
        if (!attempted.current) {
          next = await persist(() => readRoomCreationIntent(principal), next);
          if (!sameActor()) return;
          activeRequestId = next?.requestId ?? null;
          setIntent(next);
        }
        // 一度開いたルームや旧形式の成功控えは、新しい作成の意図へ持ち越さない。
        if (
          next &&
          (next.state === "closed" ||
            next.state === "expired" ||
            (next.roomId &&
              (!next.unopened || wasRoomCreationOpened(next.roomId))) ||
            (next.state === "prepared" && attempted.current !== next.requestId))
        )
          next = null;
        // 終了・期限切れが判明した前回分は選択から外して新規発行する。
        if (next && !next.roomId) {
          const query = await queryRoomCreation(principal, next.requestId);
          if (!(await selected())) return;
          if (!query.ok) {
            setMessage(RETRY_MESSAGE);
            return;
          }
          if (query.status.kind === "ready") {
            const recovered = {
              ...next,
              state: "known" as const,
              roomId: query.status.roomId,
              name: "",
              unopened: true,
            };
            const previous = next;
            const recoveredRoomId = query.status.roomId;
            next = await persist(
              () =>
                saveRoomCreationResult(principal, previous, recoveredRoomId),
              recovered,
            );
            if (wasRoomCreationOpened(recoveredRoomId)) next = null;
          } else if (
            query.status.kind === "closed" ||
            query.status.acceptance === "expired"
          ) {
            next = null;
          }
        }
        if (next?.roomId) {
          recoveredDestination = await returnToRoom(next.roomId);
          if (!(await selected())) return;
          if (
            recoveredDestination.kind === "unavailable_room" ||
            (recoveredDestination.kind === "ready" &&
              recoveredDestination.href.startsWith("/completed-rooms/"))
          ) {
            next = null;
            recoveredDestination = undefined;
          }
        }
        if (!next) {
          const issued = await issueRoomCreation(principal);
          if (!sameActor()) return;
          if (!issued.ok) {
            setMessage(RETRY_MESSAGE);
            return;
          }
          const candidate: RoomCreationIntent = {
            ...issued.issued,
            expectedPrincipal: principal,
            name: name.trim(),
            state: "prepared",
            generation: crypto.randomUUID(),
          };
          next = await persist(
            () => saveRoomCreationIntent(principal, candidate, activeRequestId),
            candidate,
          );
          if (!sameActor()) return;
          setIntent(next);
          // 保存中に選択が変わった場合は、次の試行で勝者の現在状態を確認する。
          if (next.requestId !== candidate.requestId) {
            setMessage(RETRY_MESSAGE);
            return;
          }
          attempted.current = next.requestId;
        }
        if (!(await selected())) return;
        let roomId = next.roomId;
        let entryAdmission: string | undefined;
        if (!roomId) {
          if (next.state === "conflict") {
            setMessage(RETRY_MESSAGE);
            return;
          }
          const prepared = next;
          next = await persist(
            () => markRoomCreationSubmitted(principal, prepared),
            { ...next, state: "submitted" },
          );
          if (!(await selected())) return;
          setIntent(next);
          attempted.current = next.requestId;
          const result = next.roomId
            ? { ok: true as const, roomId: next.roomId }
            : await createRoom({
                expectedPrincipal: principal,
                requestId: next.requestId,
                name: next.name,
              });
          if (result.ok) {
            roomId = result.roomId;
            entryAdmission =
              "entryToken" in result ? result.entryToken : undefined;
            // 応答が遅くても本人の控えだけに成功結果を残す。UI反映は選択確認後。
            const submitted = next;
            next = await persist(
              () => saveRoomCreationResult(principal, submitted, result.roomId),
              { ...next, state: "known", roomId, name: "", unopened: true },
            );
          } else {
            if (!(await selected())) return;
            if (
              result.failedOperation ||
              result.pendingOperation ||
              result.confirmation
            ) {
              setSwitching(
                result.failedOperation ??
                  result.pendingOperation ??
                  result.confirmation,
              );
              return;
            }
            if (result.reason === "reauth_required") {
              setReauthentication({
                kind: "create",
                input: {
                  expectedPrincipal: principal,
                  requestId: next.requestId,
                  name: next.name,
                },
              });
              return;
            }
            if (
              result.reason === "expired" ||
              result.reason === "closed" ||
              result.reason === "input_conflict"
            ) {
              const state =
                result.reason === "input_conflict" ? "conflict" : result.reason;
              const failed = next;
              next = await persist(
                () => updateRoomCreationIntent(principal, failed, { state }),
                { ...next, state },
              );
              setIntent(next);
            }
            setMessage(RETRY_MESSAGE);
            return;
          }
        }
        if (!(await selected())) return;
        setIntent(next);
        rememberLastRoom(principal, roomId);
        const destination = entryAdmission
          ? {
              kind: "ready" as const,
              href: `/rooms/${roomId}/start`,
              entryToken: entryAdmission,
            }
          : (recoveredDestination ?? (await returnToRoom(roomId)));
        if (!(await selected())) return;
        if (destination.kind === "reauth_required") {
          setReauthentication({ kind: "return", roomId });
          return;
        }
        if (destination.kind !== "ready") {
          // 退出・除外・終了・完了済みの前回分は次の試行へ持ち越さない。
          if (destination.kind === "unavailable_room") {
            const unavailable = next;
            next = await persist(
              () =>
                updateRoomCreationIntent(principal, unavailable, {
                  state: "closed",
                }),
              { ...next, state: "closed" },
            );
            setIntent(next);
          }
          setMessage(RETRY_MESSAGE);
          return;
        }
        const href = await entryDestination(
          destination.href,
          roomId,
          destination.entryToken,
        );
        if (!(await selected())) return;
        setNavigating(true);
        lifecycleNotify.roomCreated();
        router.push(href);
        navigationTimer.current = setTimeout(() => {
          if (!sameActor()) return;
          setNavigating(false);
          setMessage(RETRY_MESSAGE);
        }, 15_000);
        notifyRoomCreations(false);
      } catch {
        if ((await selected()) || (!next && sameActor())) {
          setNavigating(false);
          setMessage(RETRY_MESSAGE);
        }
      } finally {
        submitting.current = false;
      }
    });
  }
  return {
    switching,
    onCancelSwitch: () => setSwitching(undefined),
    onSwitchReady: async (roomId) => {
      const principal = currentUserId;
      const turn = generation.current;
      const current = () =>
        actor.current === principal && generation.current === turn;
      const target =
        switching && (!("kind" in switching) || switching.kind === "pending")
          ? switching.target
          : undefined;
      if (
        !principal ||
        !current() ||
        !intent ||
        target?.kind !== "create" ||
        target.input.requestId !== intent.requestId ||
        target.input.expectedPrincipal !== principal
      )
        return;
      const receipt = {
        ...intent,
        state: "known" as const,
        roomId,
        name: "",
        unopened: true,
      };
      try {
        const selected =
          !storageAvailable.current ||
          (await isRoomCreationSelected(
            principal,
            intent.requestId,
            intent.generation,
          ));
        if (!selected || !current()) return;
        const saved = storageAvailable.current
          ? await saveRoomCreationResult(principal, intent, roomId)
          : receipt;
        if (current()) setIntent(saved);
        notifyRoomCreations(false);
      } catch {
        if (current()) setIntent(receipt);
      }
    },
    reauthentication,
    onCancelReauthentication: () => setReauthentication(undefined),
    pending: pending || navigating || loadedPrincipal !== currentUserId,
    onSubmit: handleSubmit,
    intentName: submittedName,
    message: loadedPrincipal === currentUserId ? message : undefined,
  };
}

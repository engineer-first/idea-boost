"use client";

// ルームボードのコンテナ。関心ごとの hook を束ねて view に渡すだけにする。
//   - WebSocket 接続と切断時の遷移: use-room-connection
//   - 付箋の状態・楽観更新ポリシー・プロトコル化: use-room-notes
//   - グループの状態とプロトコル化: use-note-groups
//   - members / phase / timer の適用と入退出通知: use-room-state
//   - 退出 / 解散フロー: use-leave-room
// このファイルに残るのはフェーズ進行の操作と画面反応だけ。
//
// 確定状態の真実はサーバー（RoomDO）側にあり、再接続時は snapshot で復元される。
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SetDisplayNameInput } from "@/contracts/display-name";
import { isResultStep, type RoomPhase } from "@/contracts/phase";
import {
  type ClientMessage,
  needsHostRevision,
  type ServerMessage,
} from "@/contracts/room-protocol";
import { canPublishNoteInTurn } from "@/contracts/sharing";
import type { DisplayNameResult } from "@/features/auth";
import { submitFeedback, useFeedback } from "@/features/feedback";
import { HMW_EXAMPLES } from "@/features/hmw";
import {
  NoteDraftRecovery,
  useMoveHistory,
  useNoteAutosave,
  useNoteGroups,
  useRoomNotes,
} from "@/features/notes";
import { notify } from "@/lib/notify";
import type { RoomSocketFactory } from "@/lib/room-client/room-client";
import { getBoardPermissions } from "../logic/board-permissions";
import { roomNotify } from "../logic/room-notify";
import type { Member } from "../logic/room-reducer";
import { useBoardHelp } from "../logic/use-board-help";
import { useCandidateOperations } from "../logic/use-candidate-operations";
import { useCursorPresence } from "../logic/use-cursor-presence";
import { useHostTransfer } from "../logic/use-host-transfer";
import { useLeaveRoom } from "../logic/use-leave-room";
import { useMemberRemoval } from "../logic/use-member-removal";
import { useRoomBoardInteractions } from "../logic/use-room-board-interactions";
import { useRoomConnection } from "../logic/use-room-connection";
import { useRoomDisplayName } from "../logic/use-room-display-name";
import { useRoomName } from "../logic/use-room-name";
import { useRoomState } from "../logic/use-room-state";
import { useSharingReactions } from "../logic/use-sharing-reactions";
import { getBoardFitInsets, RoomBoardView } from "../templates/room-board-view";

export type RoomBoardProps = {
  roomId: string;
  inviteCode: string;
  inviteUrl: string;
  currentUserId: string;
  // 自分がこのルームのホストかどうか（表示用・操作制御）。
  isHost: boolean;
  // ホストの userId（メンバー一覧の「ホスト」ラベル表示用）。
  hostUserId: string;
  // SSR 時にサーバーから取得した初期状態。再接続時の flicker を抑える。
  initialMembers: Member[];
  initialPhase: RoomPhase;
  signOutAction?: () => Promise<void>;
  // テストからフェイク WebSocket を注入するための口。本番では未指定。
  webSocketFactory?: RoomSocketFactory;
  saveDisplayNameAction?: (
    input: SetDisplayNameInput,
  ) => Promise<DisplayNameResult>;
  // テストでボード操作を単体検証するときは案内モーダルを無効化する。
};

function isPrivateNotesWorkspaceHandoff(
  from: RoomPhase,
  to: RoomPhase,
): boolean {
  return (
    from.kind === "step" &&
    to.kind === "step" &&
    from.phase === to.phase &&
    from.step === 1 &&
    to.step === 2
  );
}

export function RoomBoard({
  roomId,
  inviteCode,
  inviteUrl,
  currentUserId,
  isHost: initialIsHost,
  hostUserId: initialHostUserId,
  initialMembers,
  initialPhase,
  signOutAction,
  webSocketFactory,
  saveDisplayNameAction,
}: RoomBoardProps) {
  const feedback = useFeedback(roomId, submitFeedback);
  const [completionResetVersion, setCompletionResetVersion] = useState(0);
  const [isNextPhasePending, setIsNextPhasePending] = useState(false);
  const [isPrivateNotesHandoffPending, setIsPrivateNotesHandoffPending] =
    useState(false);
  const privateNotesHandoffCleanupRef = useRef<(() => void) | null>(null);
  const candidateNoticeIdsRef = useRef(new Set<string | number>());
  const bulkUndoIdsRef = useRef(new Set<string>());
  const bulkNoticeIdsRef = useRef(new Map<string, string | number>());

  const roomState = useRoomState({ initialMembers, initialPhase });
  const hostUserId = roomState.host.hostUserId ?? initialHostUserId;
  const isHost = roomState.host.hostUserId
    ? hostUserId === currentUserId
    : (roomState.host.isHost ?? initialIsHost);
  const { isLeaving, isLeavingRef, leave } = useLeaveRoom({
    roomId,
    isHost,
    completed: roomState.outcomePublished,
    hostRevision: roomState.host.hostRevision ?? 0,
  });
  // onMessage にはホイスティングされる関数宣言（下記）を渡す。
  // useRoomConnection は常に最新のハンドラへ配送するため、
  // ハンドラの再生成で再接続されることはない。
  const {
    connectionStatus,
    connectionDelayed,
    send: sendRaw,
    resynchronize,
  } = useRoomConnection({
    roomId,
    currentUserId,
    onMessage: handleServerMessage,
    webSocketFactory,
    isLeavingRef,
  });
  // 確認画面・Undoが取得した世代を保持する。再描画前の古いcallbackを最新世代へ昇格しない。
  const historyObserverRef = useRef<((message: ClientMessage) => void) | null>(
    null,
  );
  const send = useCallback(
    (message: ClientMessage) => {
      const sent = sendRaw(
        needsHostRevision(message) &&
          message.expectedHostRevision === undefined &&
          roomState.host.hostRevision !== null
          ? { ...message, expectedHostRevision: roomState.host.hostRevision }
          : message,
      );
      if (sent !== false) historyObserverRef.current?.(message);
      return sent;
    },
    [sendRaw, roomState.host.hostRevision],
  );
  const hostTransfer = useHostTransfer({
    isHost,
    hostRevision: roomState.host.hostRevision,
    connected: connectionStatus === "open",
    blocked: isNextPhasePending || isLeaving || roomState.outcomePublished,
    send,
  });
  const roomName = useRoomName({
    connected: connectionStatus === "open",
    blocked: isLeaving || roomState.outcomePublished,
    send,
  });
  const displayName = useRoomDisplayName({
    roomId,
    save: saveDisplayNameAction,
    currentUserId,
    members: roomState.members,
    connected: connectionStatus === "open",
    blocked: isLeaving || roomState.outcomePublished,
    send,
  });
  const memberRemoval = useMemberRemoval({
    isHost,
    currentUserId,
    hostRevision: roomState.host.hostRevision,
    connected: connectionStatus === "open",
    blocked:
      isNextPhasePending ||
      hostTransfer.pending ||
      isLeaving ||
      roomState.outcomePublished,
    members: roomState.members,
    send,
  });
  const drafts = useNoteAutosave({ roomId, userId: currentUserId, send });
  const sharingGenerationRef = useRef(0);
  const handleUnknownNoteCreation = useCallback((): void => {
    notify.error("付箋を追加できたか確認できません。接続を確認しています。");
    resynchronize();
  }, [resynchronize]);
  const notes = useRoomNotes({
    send,
    connected: connectionStatus === "open",
    canCreateNote:
      getBoardPermissions(roomState.phase, roomState.decision !== null)
        .canCreateNote &&
      !isNextPhasePending &&
      !isLeaving &&
      !roomState.outcomePublished,
    onNoteCreationUnknown: handleUnknownNoteCreation,
  });
  useEffect(() => {
    if (notes.noteCreationFailure)
      notify.error(notes.noteCreationFailure.message);
  }, [notes.noteCreationFailure]);
  const moveHistory = useMoveHistory({
    send,
    notes: notes.notes,
    currentUserId,
    connected: connectionStatus === "open",
    blocked:
      notes.movePending ||
      notes.draggingNoteId !== null ||
      hostTransfer.pending ||
      memberRemoval.pending ||
      isNextPhasePending ||
      isLeaving ||
      roomState.outcomePublished,
  });
  historyObserverRef.current = moveHistory.observeOutgoing;
  useEffect(() => {
    if (notes.moveFeedback) notify.error(notes.moveFeedback.message);
  }, [notes.moveFeedback]);
  const candidates = useCandidateOperations({
    notes: notes.notes,
    connected: connectionStatus === "open",
    send,
  });
  const noteGroups = useNoteGroups({ send });
  const help = useBoardHelp(roomState.phase);
  const cursorPresence = useCursorPresence({
    currentUserId,
    phase: roomState.phase,
    connectionStatus,
    send,
  });
  const sharingReactions = useSharingReactions({
    phase: roomState.phase,
    phaseRevision: roomState.phaseRevision,
    connectionStatus,
    blocked: isLeaving || isNextPhasePending || roomState.outcomePublished,
    send,
  });

  function clearCandidateNotices(): void {
    bulkUndoIdsRef.current.clear();
    bulkNoticeIdsRef.current.clear();
    for (const id of candidateNoticeIdsRef.current)
      roomNotify.dismissCandidateNotice(id);
    candidateNoticeIdsRef.current.clear();
  }

  function beginPrivateNotesHandoff(): void {
    privateNotesHandoffCleanupRef.current?.();
    privateNotesHandoffCleanupRef.current = null;
    if (
      typeof document === "undefined" ||
      typeof document.startViewTransition !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setIsPrivateNotesHandoffPending(false);
      return;
    }

    setIsPrivateNotesHandoffPending(true);
    let timeoutId: number | undefined;
    const finish = (): void => {
      cleanup();
      setIsPrivateNotesHandoffPending(false);
    };
    const onAnimationEnd = (event: AnimationEvent): void => {
      if (event.pseudoElement === "::view-transition-group(private-notes-area)")
        finish();
    };
    const cleanup = (): void => {
      document.removeEventListener("animationend", onAnimationEnd, true);
      document.removeEventListener("animationcancel", onAnimationEnd, true);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (privateNotesHandoffCleanupRef.current === cleanup)
        privateNotesHandoffCleanupRef.current = null;
    };
    document.addEventListener("animationend", onAnimationEnd, true);
    document.addEventListener("animationcancel", onAnimationEnd, true);
    timeoutId = window.setTimeout(finish, 1000);
    privateNotesHandoffCleanupRef.current = cleanup;
  }

  useEffect(
    () => () => {
      privateNotesHandoffCleanupRef.current?.();
      for (const id of candidateNoticeIdsRef.current)
        roomNotify.dismissCandidateNotice(id);
      candidateNoticeIdsRef.current.clear();
    },
    [],
  );

  const rememberCandidateNotice = useCallback(
    (id: string | number, operationId: string): void => {
      candidateNoticeIdsRef.current.add(id);
      bulkNoticeIdsRef.current.set(operationId, id);
    },
    [],
  );

  function handleServerMessage(message: ServerMessage) {
    if (message.type === "sharing:updated") sharingGenerationRef.current += 1;
    if (roomName.applyMessage(message)) return;
    if (displayName.applyMessage(message)) return;
    moveHistory.applyMessage(message);
    if (memberRemoval.applyMessage(message)) return;
    if (hostTransfer.applyMessage(message)) return;
    if (
      message.type === "host:updated" &&
      message.hostRevision > (roomState.host.hostRevision ?? -1)
    ) {
      setIsNextPhasePending(false);
    }
    if (
      message.type === "snapshot" ||
      message.type === "outcome:published" ||
      (message.type === "decision:updated" && message.decision !== null) ||
      (message.type === "phase:updated" &&
        (!isResultStep(message.phase) ||
          roomState.phase.kind !== "step" ||
          message.phase.kind !== "step" ||
          message.phase.phase !== roomState.phase.phase))
    ) {
      clearCandidateNotices();
    }
    const receivedAt = Date.now();
    drafts.applyMessage(message);
    if (candidates.applyMessage(message)) return;
    if (message.type === "snapshot") {
      bulkUndoIdsRef.current.clear();
      bulkNoticeIdsRef.current.clear();
    }
    if (message.type === "note:bulk-excluded") {
      if (message.count > 0) {
        const undo = () => {
          if (!bulkUndoIdsRef.current.has(message.operationId)) return;
          if (candidates.bulkRestore(message.operationId))
            bulkUndoIdsRef.current.delete(message.operationId);
        };
        if (message.source === "phase-transition") {
          bulkUndoIdsRef.current.add(message.operationId);
          rememberCandidateNotice(
            roomNotify.automaticallyExcludedCandidates(message.count, undo),
            message.operationId,
          );
        } else {
          bulkUndoIdsRef.current.add(message.operationId);
          rememberCandidateNotice(
            roomNotify.bulkCandidatesExcluded(message.count, undo),
            message.operationId,
          );
        }
      }
    }
    if (message.type === "note:bulk-restored") {
      const notice = bulkNoticeIdsRef.current.get(message.operationId);
      if (notice !== undefined) {
        roomNotify.dismissCandidateNotice(notice);
        candidateNoticeIdsRef.current.delete(notice);
        bulkNoticeIdsRef.current.delete(message.operationId);
      }
      bulkUndoIdsRef.current.delete(message.operationId);
    }
    if (message.type === "error") {
      notes.applyMessage(message);
      if (message.operationId !== undefined) {
        return;
      }
      setCompletionResetVersion((version) => version + 1);
      if (message.code === "phase-confirmation-required") {
        setIsNextPhasePending(false);
        notify.error(message.message);
        return;
      }
      console.warn(`ルーム操作エラー (${message.code}): ${message.message}`);
      notify.error(message.message);
      setIsNextPhasePending(false);
      return;
    }

    if (message.type === "phase:updated" || message.type === "snapshot") {
      setIsNextPhasePending(false);
    }

    notes.applyMessage(message);
    if (
      message.type === "snapshot" ||
      message.type === "phase:updated" ||
      message.type === "outcome:published" ||
      (message.type === "decision:updated" && message.decision !== null)
    )
      boardInteractions.cancelCurrentNoteDrag(true);
    noteGroups.applyMessage(message);
    if (
      (message.type === "phase:updated" || message.type === "snapshot") &&
      isPrivateNotesWorkspaceHandoff(roomState.phase, message.phase)
    ) {
      beginPrivateNotesHandoff();
      startTransition(() => roomState.applyMessage(message, receivedAt));
    } else {
      roomState.applyMessage(message, receivedAt);
    }
    cursorPresence.applyMessage(message, receivedAt);
    sharingReactions.applyMessage(message, receivedAt);
  }

  const handleNextPhase = useCallback(
    (confirmedProgressRevision?: number) => {
      if (
        connectionStatus !== "open" ||
        hostTransfer.isPending() ||
        memberRemoval.isPending() ||
        isNextPhasePending
      )
        return;
      setIsNextPhasePending(true);
      const sent = send({
        type: "phase:next",
        expectedPhase: roomState.phase,
        expectedRevision: roomState.phaseRevision,
        confirmedProgressRevision,
      });
      if (sent === false) setIsNextPhasePending(false);
    },
    [
      connectionStatus,
      hostTransfer.isPending,
      memberRemoval.isPending,
      isNextPhasePending,
      send,
      roomState.phase,
      roomState.phaseRevision,
    ],
  );

  const handleToggleReady = useCallback(
    (ready: boolean) => {
      if (connectionStatus !== "open" || roomState.outcomePublished)
        return false;
      return send({
        type: "phase:ready",
        expectedPhase: roomState.phase,
        expectedRevision: roomState.phaseRevision,
        ready,
      });
    },
    [
      connectionStatus,
      roomState.outcomePublished,
      roomState.phase,
      roomState.phaseRevision,
      send,
    ],
  );

  const handleRollbackPhase = useCallback(() => {
    if (
      !roomState.rollbackTarget ||
      roomState.outcomePublished ||
      connectionStatus !== "open" ||
      hostTransfer.isPending() ||
      memberRemoval.isPending() ||
      isNextPhasePending ||
      isLeaving
    )
      return;
    setIsNextPhasePending(true);
    const sent = send({
      type: "phase:rollback",
      expectedPhase: roomState.phase,
      expectedRevision: roomState.phaseRevision,
    });
    if (sent === false) setIsNextPhasePending(false);
  }, [
    roomState.rollbackTarget,
    roomState.outcomePublished,
    connectionStatus,
    hostTransfer.isPending,
    memberRemoval.isPending,
    isNextPhasePending,
    isLeaving,
    send,
    roomState.phase,
    roomState.phaseRevision,
  ]);

  const handleNoteDecide = useCallback(
    (noteId: string) => send({ type: "note:decide", noteId }),
    [send],
  );

  const handleDecisionClear = useCallback(() => {
    if (!roomState.decision || roomState.outcomePublished) return;
    send({ type: "decision:clear", noteId: roomState.decision.noteId });
  }, [roomState.decision, roomState.outcomePublished, send]);

  const handleAdoptionFocusChange = useCallback(
    (noteId: string | null) => {
      send({ type: "adoption-focus:update", noteId });
    },
    [send],
  );

  const handleLoopPhase = useCallback(
    (type: "phase:restart-writing" | "phase:revote") => {
      if (
        hostTransfer.isPending() ||
        memberRemoval.isPending() ||
        isNextPhasePending
      )
        return;
      setIsNextPhasePending(true);
      send({
        type,
        expectedPhase: roomState.phase,
        expectedRevision: roomState.phaseRevision,
      });
    },
    [
      hostTransfer.isPending,
      memberRemoval.isPending,
      isNextPhasePending,
      send,
      roomState.phase,
      roomState.phaseRevision,
    ],
  );

  const handleTimerStart = useCallback(
    (durationMs: number) => send({ type: "timer:start", durationMs }),
    [send],
  );
  const handleTimerPause = useCallback(
    () => send({ type: "timer:pause" }),
    [send],
  );
  const handleTimerResume = useCallback(
    () => send({ type: "timer:resume" }),
    [send],
  );
  const handleTimerExtend = useCallback(
    () => send({ type: "timer:extend" }),
    [send],
  );
  const handleTimerStop = useCallback(
    () => send({ type: "timer:stop" }),
    [send],
  );
  const handleIdeaMapResize = useCallback(
    (sizeLevel: number) => send({ type: "idea-map:resize", sizeLevel }),
    [send],
  );

  // PrivateNotesToolbar は onClick={onAdd} でイベントをそのまま渡すため、
  // addNote(content?) を直接配線するとイベントオブジェクトが content に
  // 流れ込む。引数なし版とテンプレート版を別コールバックに分けて形で塞ぐ。
  const { addNote } = notes;
  const handleAddPrivateNote = notes.requestAddNote;
  const handleHmwTemplateSelect = useCallback(
    (content: string) => {
      if (roomState.timer.status !== "running") return;
      addNote(content);
    },
    [addNote, roomState.timer.status],
  );
  const handleIdeaHintSelect = useCallback(
    (content: string) => {
      if (roomState.timer.status !== "running") return;
      addNote(content);
    },
    [addNote, roomState.timer.status],
  );

  // フェーズ2では決定課題を、フェーズ3では決定課題と決定した問いを掲示する。
  // 持ち越しはフェーズ昇順の配列なので、由来フェーズで取り出す。
  const currentPhase =
    roomState.phase.kind === "step" ? roomState.phase.phase : null;
  const hmwDecidedIssue =
    currentPhase === 2 || currentPhase === 3
      ? (roomState.carryovers.find((carryover) => carryover.phase === 1)
          ?.content ?? null)
      : null;
  const decidedHmw =
    currentPhase === 3
      ? (roomState.carryovers.find((carryover) => carryover.phase === 2)
          ?.content ?? null)
      : null;

  const boardNotes = candidates.notes.filter(
    (note) => note.visibility === "shared",
  );
  const boardPrivateNotes = notes.notes.filter(
    (note) => note.visibility === "private",
  );
  const publishContextRef = useRef({
    roomState,
    connectionStatus,
    isNextPhasePending,
    isLeaving,
    notes,
  });
  publishContextRef.current = {
    roomState,
    connectionStatus,
    isNextPhasePending,
    isLeaving,
    notes,
  };
  const handlePrivateNotePublish = useCallback(
    (noteId: string, x: number, y: number) => {
      const sharingGeneration = sharingGenerationRef.current;
      drafts.saveBeforeShare(noteId, () => {
        if (sharingGeneration !== sharingGenerationRef.current) return;
        const current = publishContextRef.current;
        if (
          current.connectionStatus !== "open" ||
          current.isNextPhasePending ||
          current.isLeaving ||
          current.roomState.outcomePublished ||
          current.roomState.decision !== null ||
          !canPublishNoteInTurn(
            current.roomState.phase,
            current.roomState.sharing,
            currentUserId,
          )
        )
          return;
        current.notes.publishNote(noteId, x, y);
      });
    },
    [drafts.saveBeforeShare, currentUserId],
  );
  const boardInteractions = useRoomBoardInteractions({
    movePending: notes.movePending || moveHistory.pending,
    // 通常移動は先の保存待ちでも入力を保持する。共有境界・逆操作とは重ねない。
    moveBlocked: notes.sharePending || moveHistory.pending,
    onPendingMoveInterrupt: notes.cancelNoteDrag,
    getFitInsets: getBoardFitInsets,
    notes: boardNotes,
    isDecided: roomState.decision !== null,
    privateNotes: boardPrivateNotes,
    currentUserId,
    draggingNoteId: notes.draggingNoteId,
    phase: roomState.phase,
    ideaMapSizeLevel: roomState.ideaMap.sizeLevel,
    sharing: roomState.sharing,
    ideaMapSizeInitialized: roomState.ideaMap.initialized,
    onNoteDragStart: notes.startNoteDrag,
    onNoteDragMove: notes.moveNote,
    onNoteDragEnd: notes.endNoteDrag,
    onNoteDragCancel: notes.cancelNoteDrag,
    onPrivateNotePublish: handlePrivateNotePublish,
    onPrivateNoteUnpublish: notes.unpublishNote,
    onCursorMove: cursorPresence.updateCursor,
    onCursorLeave: cursorPresence.leaveCanvas,
  });

  useEffect(() => {
    if (connectionStatus === "open") return;
    drafts.setConnected(false);
    if (
      connectionStatus === "auth-required" ||
      connectionStatus === "unavailable"
    )
      drafts.recoverDisconnected();
    notes.cancelNoteDrag();
    notes.clearPeerMoves();
    moveHistory.clear("接続が切れたため、移動履歴を終了しました。");
    boardInteractions.cancelCurrentNoteDrag(true);
  }, [
    boardInteractions.cancelCurrentNoteDrag,
    connectionStatus,
    notes.cancelNoteDrag,
    notes.clearPeerMoves,
    moveHistory.clear,
    drafts.setConnected,
    drafts.recoverDisconnected,
  ]);

  return (
    <>
      <RoomBoardView
        isPrivateNotesHandoffPending={isPrivateNotesHandoffPending}
        sharingReactions={sharingReactions.reactions}
        reactionControls={{
          disabled: !sharingReactions.canSendLike,
          onSendLike: sharingReactions.sendLike,
        }}
        loginReturnHref={`/rooms/${roomId}`}
        moveHistory={{
          undo: moveHistory.undoState,
          redo: moveHistory.redoState,
          pending: moveHistory.pending,
          onUndo: moveHistory.undo,
          onRedo: moveHistory.redo,
        }}
        feedback={feedback}
        notes={boardNotes}
        exampleNotes={
          roomState.phase.kind === "step" &&
          roomState.phase.phase === 2 &&
          roomState.phase.step === 1
            ? HMW_EXAMPLES
            : []
        }
        confirmedNotes={notes.notes.filter(
          (note) => note.visibility === "shared",
        )}
        pendingCandidateNoteIds={candidates.pendingNoteIds}
        isCandidatePending={candidates.isPending}
        groups={noteGroups.groups}
        hmwDecidedIssue={hmwDecidedIssue}
        decidedHmw={decidedHmw}
        issueReference={
          currentPhase === 2 || currentPhase === 3
            ? (roomState.carryovers.find((item) => item.phase === 1) ?? null)
            : null
        }
        hmwReference={
          currentPhase === 3
            ? (roomState.carryovers.find((item) => item.phase === 2) ?? null)
            : null
        }
        inviteCode={inviteCode}
        inviteUrl={inviteUrl}
        phase={roomState.phase}
        phaseRevision={roomState.phaseRevision}
        rollbackTarget={roomState.rollbackTarget}
        rollbackRevision={roomState.rollbackRevision}
        onRollbackPhase={handleRollbackPhase}
        ideaMapSizeLevel={roomState.ideaMap.sizeLevel}
        ideaMapSizeInitialized={roomState.ideaMap.initialized}
        ideaMapIsDragging={roomState.ideaMap.isDragging}
        onIdeaMapResize={handleIdeaMapResize}
        sharing={roomState.sharing}
        onSharingStart={(durationMs) => {
          if (roomState.sharing)
            send({
              type: "sharing:start",
              revision: roomState.sharing.revision,
              durationMs,
            });
        }}
        onSharingAdvance={(outcome) => {
          if (roomState.sharing)
            send({
              type: "sharing:advance",
              revision: roomState.sharing.revision,
              outcome,
            });
        }}
        timer={roomState.timer}
        timerServerOffsetMs={roomState.timerServerOffsetMs}
        timerUpdateVersion={roomState.timerUpdateVersion}
        isHost={isHost}
        hostRevision={roomState.host.hostRevision ?? 0}
        onTransferHost={
          roomState.host.hostRevision === null
            ? undefined
            : hostTransfer.transfer
        }
        isTransferring={hostTransfer.pending}
        displayName={displayName}
        roomName={roomName}
        memberRemoval={memberRemoval}
        transferError={hostTransfer.error}
        decision={roomState.decision}
        outcomePublished={roomState.outcomePublished}
        adoptionFocusNoteId={roomState.adoptionFocusNoteId}
        connectionStatus={connectionStatus}
        connectionDelayed={connectionDelayed}
        draggingNoteId={notes.frontNoteId}
        members={roomState.members}
        currentUserId={currentUserId}
        hostUserId={hostUserId}
        completedVoterIds={roomState.completedVoterIds}
        progress={roomState.progress}
        onToggleReady={handleToggleReady}
        completionResetVersion={completionResetVersion}
        isNextPhasePending={isNextPhasePending}
        isSavingBeforeShare={drafts.sharingSavePending}
        signOutAction={signOutAction}
        interactions={boardInteractions}
        help={help}
        remoteCursors={cursorPresence.remoteCursors}
        pendingVoteOperations={notes.pendingVoteOperations}
        voteFeedback={notes.voteFeedback}
        onAddPrivateNote={handleAddPrivateNote}
        noteCreationPending={notes.noteCreationPending}
        noteCreationSupported={notes.noteCreationSupported}
        noteCreationReceipt={notes.noteCreationReceipt ?? undefined}
        onHmwTemplateSelect={handleHmwTemplateSelect}
        onIdeaHintSelect={handleIdeaHintSelect}
        onPrivateNoteContentChange={drafts.blur}
        onPrivateNoteDelete={notes.deleteNote}
        onNextPhase={handleNextPhase}
        onTimerStart={handleTimerStart}
        onTimerPause={handleTimerPause}
        onTimerResume={handleTimerResume}
        onTimerExtend={handleTimerExtend}
        onTimerStop={handleTimerStop}
        onNoteContentChange={drafts.blur}
        draftValue={drafts.draftValue}
        onDraftChange={drafts.change}
        onDraftCompositionStart={drafts.compositionStart}
        onDraftCompositionEnd={drafts.compositionEnd}
        onNoteFontSizeChange={notes.changeNoteFontSize}
        onNoteDelete={notes.deleteNote}
        onNoteBringToFront={notes.bringNoteToFront}
        onNoteExclude={candidates.exclude}
        onNoteRestore={candidates.restore}
        onGroupCreate={noteGroups.createGroup}
        onGroupUpdateName={noteGroups.renameGroup}
        onNoteVote={notes.voteNote}
        onNoteVoteRemove={notes.removeNoteVote}
        onNoteVoteStickerRemove={notes.removeVoteSticker}
        onNoteVoteStickerMove={notes.moveVoteSticker}
        onNoteDecide={handleNoteDecide}
        onDecisionClear={handleDecisionClear}
        onPublishOutcome={() => send({ type: "outcome:publish" })}
        onAdoptionFocusChange={handleAdoptionFocusChange}
        onRestartWriting={() => handleLoopPhase("phase:restart-writing")}
        onRevote={() => handleLoopPhase("phase:revote")}
        onLeave={leave}
        isLeaving={isLeaving}
      />
      <NoteDraftRecovery items={drafts.recoveries} />
    </>
  );
}

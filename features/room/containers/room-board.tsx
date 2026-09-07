"use client";

// ルームボードのコンテナ。関心ごとの hook を束ねて view に渡すだけにする。
//   - WebSocket 接続と切断時の遷移: use-room-connection
//   - 付箋の状態・楽観更新ポリシー・プロトコル化: use-room-notes
//   - グループの状態とプロトコル化: use-note-groups
//   - members / phase / timer の適用と入退出通知: use-room-state
//   - 退出 / 解散フロー: use-leave-room
// このファイルに残るのは「フェーズ進行の operation 化」と「エラー応答の
// 画面反応（強制進行ダイアログ）」というボード画面固有の配線だけ。
//
// 確定状態の真実はサーバー（RoomDO）側にあり、再接続時は snapshot で復元される。
import { useCallback, useState } from "react";
import type { RoomPhase } from "@/contracts/phase";
import type { ServerMessage } from "@/contracts/room-protocol";
import { isHmwWritingStep } from "@/features/hmw";
import { useNoteGroups, useRoomNotes } from "@/features/notes";
import { notify } from "@/lib/notify";
import type { RoomSocketFactory } from "@/lib/room-client/room-client";
import type { Member } from "../logic/room-reducer";
import { useLeaveRoom } from "../logic/use-leave-room";
import { useRoomBoardInteractions } from "../logic/use-room-board-interactions";
import { useRoomConnection } from "../logic/use-room-connection";
import { useRoomState } from "../logic/use-room-state";
import { ForceNextPhaseDialog } from "../molecules/force-next-phase-dialog";
import { RoomBoardView } from "../templates/room-board-view";

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
};

export function RoomBoard({
  roomId,
  inviteCode,
  inviteUrl,
  currentUserId,
  isHost,
  hostUserId,
  initialMembers,
  initialPhase,
  signOutAction,
  webSocketFactory,
}: RoomBoardProps) {
  const [isNextPhasePending, setIsNextPhasePending] = useState(false);
  const [isForceNextPhaseDialogOpen, setIsForceNextPhaseDialogOpen] =
    useState(false);

  const { isLeaving, isLeavingRef, leave } = useLeaveRoom({ roomId, isHost });
  // onMessage にはホイスティングされる関数宣言（下記）を渡す。
  // useRoomConnection は常に最新のハンドラへ配送するため、
  // ハンドラの再生成で再接続されることはない。
  const { connectionStatus, send } = useRoomConnection({
    roomId,
    onMessage: handleServerMessage,
    webSocketFactory,
    isLeavingRef,
  });
  const notes = useRoomNotes({ send });
  const noteGroups = useNoteGroups({ send });
  const roomState = useRoomState({ initialMembers, initialPhase });

  function handleServerMessage(message: ServerMessage) {
    const receivedAt = Date.now();
    if (message.type === "error") {
      // 投票未完了によるゲート拒否はホストの phase:next 起点なので、toast
      // ではなく「強制的に進むか」の確認ダイアログで案内する。サーバーの
      // 評価順が変わって非ホストに届いた場合は通常のエラー表示へ落とす。
      if (message.code === "voting-incomplete" && isHost) {
        setIsNextPhasePending(false);
        setIsForceNextPhaseDialogOpen(true);
        return;
      }
      console.warn(`ルーム操作エラー (${message.code}): ${message.message}`);
      notify.error(message.message);
      if (message.code === "forbidden") {
        setIsNextPhasePending(false);
      }
      return;
    }

    if (message.type === "phase:updated" || message.type === "snapshot") {
      setIsNextPhasePending(false);
      // 進行が確定（別タブ等）・復元（再接続）されたら、開いていた
      // 強制進行の確認はフェーズ1・2の投票ステップのゲート前提が崩れているため閉じる。
      setIsForceNextPhaseDialogOpen(false);
    }

    notes.applyMessage(message);
    noteGroups.applyMessage(message);
    roomState.applyMessage(message, receivedAt);
  }

  const handleNextPhase = useCallback(() => {
    if (isNextPhasePending) return;
    setIsNextPhasePending(true);
    send({ type: "phase:next" });
  }, [isNextPhasePending, send]);

  // 投票未完了ゲートの脱出ハッチ。ForceNextPhaseDialog の確認後に
  // force 付きで再送する（ホスト以外はサーバー側で拒否される）。
  const handleForceNextPhase = useCallback(() => {
    setIsForceNextPhaseDialogOpen(false);
    if (isNextPhasePending) return;
    setIsNextPhasePending(true);
    send({ type: "phase:next", force: true });
  }, [isNextPhasePending, send]);

  const handleNoteDecide = useCallback(
    (noteId: string) => send({ type: "note:decide", noteId }),
    [send],
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

  // PrivateNotesToolbar は onClick={onAdd} でイベントをそのまま渡すため、
  // addNote(content?) を直接配線するとイベントオブジェクトが content に
  // 流れ込む。引数なし版とテンプレート版を別コールバックに分けて形で塞ぐ。
  const { addNote } = notes;
  const handleAddPrivateNote = useCallback(() => addNote(), [addNote]);
  const handleHmwTemplateSelect = useCallback(
    (content: string) => addNote(content),
    [addNote],
  );
  const handleIdeaHintSelect = useCallback(
    (content: string) => addNote(content),
    [addNote],
  );

  // Step 2-1（HMW 個人執筆）はボード面に自分の付箋だけを出す個人ステップ。
  // フェーズ1の共有付箋・グループは描画しない。共有済み付箋は全員に公開済みの
  // 情報なのでこれは表示上の判断であり、可視性の境界は引き続きサーバー
  // （visibleTo）が持つ。付箋のフェーズ分離の本実装は #165 のスコープ。
  const atHmwWritingStep = isHmwWritingStep(roomState.phase);
  // フェーズ2では決定課題を、フェーズ3では決定課題と決定HMWを掲示する。
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

  const boardNotes = atHmwWritingStep
    ? []
    : notes.notes.filter((note) => note.visibility === "shared");
  const boardPrivateNotes = notes.notes.filter(
    (note) => note.visibility === "private",
  );
  const boardInteractions = useRoomBoardInteractions({
    notes: boardNotes,
    privateNotes: boardPrivateNotes,
    currentUserId,
    draggingNoteId: notes.draggingNoteId,
    phase: roomState.phase,
    onNoteDragStart: notes.startNoteDrag,
    onNoteDragMove: notes.moveNote,
    onNoteDragEnd: notes.endNoteDrag,
    onPrivateNotePublish: notes.publishNote,
    onPrivateNoteUnpublish: notes.unpublishNote,
  });

  return (
    <>
      <ForceNextPhaseDialog
        open={isForceNextPhaseDialogOpen}
        onOpenChange={setIsForceNextPhaseDialogOpen}
        onConfirm={handleForceNextPhase}
      />
      <RoomBoardView
        notes={boardNotes}
        groups={atHmwWritingStep ? [] : noteGroups.groups}
        hmwDecidedIssue={hmwDecidedIssue}
        decidedHmw={decidedHmw}
        inviteCode={inviteCode}
        inviteUrl={inviteUrl}
        phase={roomState.phase}
        timer={roomState.timer}
        timerServerOffsetMs={roomState.timerServerOffsetMs}
        isHost={isHost}
        decision={roomState.decision}
        connectionStatus={connectionStatus}
        draggingNoteId={notes.draggingNoteId}
        members={roomState.members}
        currentUserId={currentUserId}
        hostUserId={hostUserId}
        isNextPhasePending={isNextPhasePending}
        signOutAction={signOutAction}
        interactions={boardInteractions}
        onAddPrivateNote={handleAddPrivateNote}
        onHmwTemplateSelect={handleHmwTemplateSelect}
        onIdeaHintSelect={handleIdeaHintSelect}
        onPrivateNoteContentChange={notes.changeNoteContent}
        onPrivateNoteDelete={notes.deleteNote}
        onNextPhase={handleNextPhase}
        onTimerStart={handleTimerStart}
        onTimerPause={handleTimerPause}
        onTimerResume={handleTimerResume}
        onTimerExtend={handleTimerExtend}
        onTimerStop={handleTimerStop}
        onNoteContentChange={notes.changeNoteContent}
        onNoteDelete={notes.deleteNote}
        onGroupCreate={noteGroups.createGroup}
        onGroupUpdateName={noteGroups.renameGroup}
        onNoteVote={notes.voteNote}
        onNoteVoteReset={notes.resetNoteVote}
        onNoteDecide={handleNoteDecide}
        onLeave={leave}
        isLeaving={isLeaving}
      />
    </>
  );
}

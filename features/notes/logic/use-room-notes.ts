"use client";

// 付箋の状態とプロトコル化・楽観更新ポリシーの hook（ボード画面専用）。
//
// 楽観更新のポリシー:
// - 移動: use-note-move の移動操作として本人の表示へ即時に重ね、RoomDO の結果で確定する
// - 本文: 楽観更新する（自分の操作の追従性を優先）
// - 共有・戻し: 応答待ちの間は本人の画面だけ行き先へ置き、拒否なら最新の値へ戻す
// - 最前面: RoomDO の確定応答までは対象付箋だけを一時的に前面表示する
// - 削除: 楽観更新しない。author 以外の削除はサーバーが forbidden で拒否するため、
//   確定（note:deleted）を待ってから消すことで「消えたのに戻る」揺れを避ける
// - 投票: 上限判定つきでローカル反映し、受理された操作だけ送信する
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ClientMessage,
  type DotVoteKind,
  type DotVoteSticker,
  type MoveReceipt,
  NoteFontSizeSchema,
  type ServerMessage,
  type ShareReceipt,
} from "@/contracts/room-protocol";
import {
  addVoteStickerLocally,
  applyServerMessage,
  moveVoteStickerLocally,
  type Note,
  removeOneNoteVoteLocally,
  removeVoteStickerLocally,
  resetNoteVoteLocally,
  restoreVoteStickerLocally,
  voteNoteLocally,
  withdrawOwnVotesOfKindLocally,
} from "./notes-reducer";
import { type MoveFeedback, useNoteMove } from "./use-note-move";
import { useNoteShare } from "./use-note-share";

type PendingNoteFront = {
  noteId: string;
  previousStackOrder: number;
};

type PendingFontSizeOperation = {
  id: string;
  noteId: string;
  fontSize: number;
};

export type PendingVoteOperation = {
  id: string;
  noteId: string;
  stickerId?: string;
  kind: DotVoteKind;
  action: "add" | "remove" | "move";
  // remove の拒否時に同じシールを戻すためのスナップショット。
  sticker?: DotVoteSticker;
  // move の拒否時に移動前の付箋・座標へ戻すためのスナップショット。
  previous?: {
    noteId: string;
    x: number;
    y: number;
  };
};

export type VoteFeedback = {
  state: "confirmed" | "failed";
  message: string;
};

type NoteCreation = {
  operationId: string;
  status: "pending" | "unknown";
};

const NOTE_CREATION_RESPONSE_TIMEOUT_MS = 10_000;

export type UseRoomNotesResult = {
  notes: Note[];
  clearPeerMoves: () => void;
  movePending: boolean;
  moveFeedback: MoveFeedback | null;
  lastMoveReceipt: MoveReceipt | null;
  lastShareReceipt: ShareReceipt | null;
  sharePending: boolean;
  // 接続後のサーバー状態を適用した回数。初期データとの照合が必要な処理で使う。
  snapshotVersion: number;
  draggingNoteId: string | null;
  // クリック・pointer-up 後も RoomDO の確定応答までは対象付箋を一時最前面に保つ。
  frontNoteId: string | null;
  // サーバーメッセージを notes state に畳み込む。
  applyMessage: (message: ServerMessage) => void;
  // 新規付箋は個人ツールバーへだけ挿入される。ID生成と永続化はRoomDOに一本化する。
  // content はテンプレート・具体例を起点にしたプリフィル付き作成用。
  addNote: (content?: string) => void;
  requestAddNote: (content?: string) => string | null;
  noteCreationPending: boolean;
  noteCreationSupported: boolean;
  noteCreationReceipt: { operationId: string; noteId: string } | null;
  noteCreationFailure: { operationId: string; message: string } | null;
  publishNote: (noteId: string, x: number, y: number) => void;
  unpublishNote: (noteId: string, privateIndex?: number) => void;
  // 共有付箋の移動操作。開始・途中・確定・取消は use-note-move が RoomDO と同期する。
  startNoteDrag: (noteId: string, selectedNoteIds?: readonly string[]) => void;
  bringNoteToFront: (noteId: string) => void;
  moveNote: (noteId: string, x: number, y: number) => void;
  endNoteDrag: (noteId: string, x: number, y: number) => void;
  cancelNoteDrag: (noteId?: string) => void;
  excludeNote: (noteId: string) => void;
  restoreNote: (noteId: string) => void;
  bulkExcludeZeroVoteCandidates: () => void;
  bulkRestoreCandidates: (operationId: string) => void;
  // 選択中の付箋だけを即時に再描画し、RoomDO の確定値へ収束させる。
  changeNoteFontSize: (noteId: string, fontSize: number) => void;
  deleteNote: (noteId: string) => void;
  voteNote: (noteId: string, kind: DotVoteKind, x?: number, y?: number) => void;
  removeNoteVote: (noteId: string, kind: DotVoteKind) => void;
  removeVoteSticker: (stickerId: string) => void;
  moveVoteSticker: (
    stickerId: string,
    noteId: string,
    x: number,
    y: number,
  ) => void;
  resetNoteVote: (noteId: string, kind: DotVoteKind) => void;
  // 指定した種類の自分の票を、すべての付箋から取り消す。
  withdrawAllVotesOfKind: (kind: DotVoteKind) => void;
  pendingVoteOperations: PendingVoteOperation[];
  voteFeedback: VoteFeedback | null;
};

export function useRoomNotes({
  send,
  connected = true,
  canCreateNote = true,
  createNoteOperationId = () => crypto.randomUUID(),
  onNoteCreationUnknown,
  createVoteOperationId = () => crypto.randomUUID(),
  createFontSizeOperationId = () => crypto.randomUUID(),
  createVoteStickerId = () => crypto.randomUUID(),
  createNoteDragId = () => crypto.randomUUID(),
}: {
  send: (message: ClientMessage) => boolean;
  connected?: boolean;
  canCreateNote?: boolean;
  createNoteOperationId?: () => string;
  onNoteCreationUnknown?: () => void;
  createVoteOperationId?: () => string;
  createFontSizeOperationId?: () => string;
  createVoteStickerId?: () => string;
  createNoteDragId?: () => string;
}): UseRoomNotesResult {
  // 付箋の初期状態は空。確定状態の真実はサーバー（RoomDO）側にあり、
  // 接続直後に送られてくる snapshot で復元される。
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteCreationPending, setNoteCreationPending] = useState(false);
  const [noteCreationSupported, setNoteCreationSupported] = useState(false);
  const [noteCreationReceipt, setNoteCreationReceipt] = useState<{
    operationId: string;
    noteId: string;
  } | null>(null);
  const [noteCreationFailure, setNoteCreationFailure] = useState<{
    operationId: string;
    message: string;
  } | null>(null);
  const noteCreationRef = useRef<NoteCreation | null>(null);
  const noteCreationSupportedRef = useRef(false);
  const noteCreationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const noteCreationContextRef = useRef({ connected, canCreateNote });
  noteCreationContextRef.current = { connected, canCreateNote };
  const unknownCreationCallbackRef = useRef(onNoteCreationUnknown);
  unknownCreationCallbackRef.current = onNoteCreationUnknown;
  const [snapshotVersion, setSnapshotVersion] = useState(0);
  const [pendingNoteFront, setPendingNoteFront] =
    useState<PendingNoteFront | null>(null);
  const [pendingVoteOperations, setPendingVoteOperations] = useState<
    PendingVoteOperation[]
  >([]);
  const [voteFeedback, setVoteFeedback] = useState<VoteFeedback | null>(null);
  const notesRef = useRef<Note[]>(notes);
  const pendingNoteFrontRef = useRef<PendingNoteFront | null>(null);
  const pendingVoteOperationsRef = useRef<PendingVoteOperation[]>([]);
  const pendingFontSizeOperationsRef = useRef<PendingFontSizeOperation[]>([]);
  const confirmedFontSizesRef = useRef<Map<string, number>>(new Map());

  const clearNoteCreationTimer = useCallback((): void => {
    if (noteCreationTimerRef.current !== null)
      clearTimeout(noteCreationTimerRef.current);
    noteCreationTimerRef.current = null;
  }, []);

  const finishNoteCreation = useCallback((): void => {
    clearNoteCreationTimer();
    noteCreationRef.current = null;
    setNoteCreationPending(false);
  }, [clearNoteCreationTimer]);

  useEffect(() => {
    if (connected) return;
    clearNoteCreationTimer();
    noteCreationSupportedRef.current = false;
    setNoteCreationSupported(false);
    setNoteCreationReceipt(null);
    if (noteCreationRef.current) noteCreationRef.current.status = "unknown";
  }, [connected, clearNoteCreationTimer]);

  useEffect(
    () => () => {
      clearNoteCreationTimer();
      noteCreationRef.current = null;
    },
    [clearNoteCreationTimer],
  );

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    return () => {
      notesRef.current = [];
      pendingNoteFrontRef.current = null;
      pendingFontSizeOperationsRef.current = [];
      confirmedFontSizesRef.current.clear();
    };
  }, []);

  // 連続メッセージ・連続操作でも最新の notes を引けるよう、ref と state を
  // 同期して更新する。
  const updateNotes = useCallback((update: (current: Note[]) => Note[]) => {
    const next = update(notesRef.current);
    notesRef.current = next;
    setNotes(next);
    return next;
  }, []);

  const transactionShare = useNoteShare({
    notes,
    send,
    createId: createNoteDragId,
  });
  const getNotes = useCallback(() => notesRef.current, []);
  const transactionMove = useNoteMove({
    notes,
    getNotes,
    send,
    createId: createNoteDragId,
    updateNotes,
  });
  useEffect(() => {
    if (!connected) transactionMove.cancel();
  }, [connected, transactionMove.cancel]);

  const updatePendingVoteOperations = useCallback(
    (update: (current: PendingVoteOperation[]) => PendingVoteOperation[]) => {
      const next = update(pendingVoteOperationsRef.current);
      pendingVoteOperationsRef.current = next;
      setPendingVoteOperations(next);
      return next;
    },
    [],
  );

  const updatePendingNoteFront = useCallback(
    (next: PendingNoteFront | null) => {
      pendingNoteFrontRef.current = next;
      setPendingNoteFront(next);
    },
    [],
  );

  const applyMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === "snapshot") {
        const supported = message.noteCreateProtocolVersion === 1;
        noteCreationSupportedRef.current = supported;
        setNoteCreationSupported(supported);
        // 結果不明だった要求は最新のサーバー状態だけで復帰する。再送もfocusも行わない。
        if (noteCreationRef.current?.status === "unknown") {
          finishNoteCreation();
          setNoteCreationReceipt(null);
        }
      }
      const creation = noteCreationRef.current;
      if (
        creation &&
        (message.type === "note:inserted" || message.type === "error") &&
        message.operationId === creation.operationId
      ) {
        if (message.type === "note:inserted") {
          const context = noteCreationContextRef.current;
          if (
            creation.status === "pending" &&
            context.connected &&
            context.canCreateNote
          )
            setNoteCreationReceipt({
              operationId: creation.operationId,
              noteId: message.note.id,
            });
        } else {
          setNoteCreationFailure({
            operationId: creation.operationId,
            message: message.message,
          });
        }
        finishNoteCreation();
      }
      transactionMove.applyMessage(message);
      transactionShare.applyMessage(message);
      if (message.type === "snapshot")
        setSnapshotVersion((version) => version + 1);
      if (
        message.type === "outcome:published" ||
        (message.type === "decision:updated" && message.decision !== null)
      )
        updatePendingNoteFront(null);
      const pendingFront = pendingNoteFrontRef.current;
      if (message.type === "snapshot") {
        confirmedFontSizesRef.current = new Map(
          message.notes.map((note) => [note.id, note.fontSize]),
        );
        pendingFontSizeOperationsRef.current = [];
      } else if (
        message.type === "note:inserted" ||
        message.type === "note:updated"
      ) {
        confirmedFontSizesRef.current.set(
          message.note.id,
          message.note.fontSize,
        );
      } else if (message.type === "note:deleted") {
        confirmedFontSizesRef.current.delete(message.noteId);
        pendingFontSizeOperationsRef.current =
          pendingFontSizeOperationsRef.current.filter(
            ({ noteId }) => noteId !== message.noteId,
          );
      }

      if (message.type === "error" && message.operationId !== undefined) {
        const operation = pendingFontSizeOperationsRef.current.find(
          ({ id }) => id === message.operationId,
        );
        if (operation) {
          pendingFontSizeOperationsRef.current =
            pendingFontSizeOperationsRef.current.filter(
              ({ id }) => id !== operation.id,
            );
          const remainingForNote = pendingFontSizeOperationsRef.current.filter(
            ({ noteId }) => noteId === operation.noteId,
          );
          const latest = remainingForNote[remainingForNote.length - 1];
          const fontSize =
            latest?.fontSize ??
            confirmedFontSizesRef.current.get(operation.noteId);
          if (fontSize !== undefined) {
            updateNotes((current) =>
              current.map((note) =>
                note.id === operation.noteId ? { ...note, fontSize } : note,
              ),
            );
          }
          return;
        }
      }

      if (
        message.type === "note:updated" &&
        message.operationId !== undefined
      ) {
        pendingFontSizeOperationsRef.current =
          pendingFontSizeOperationsRef.current.filter(
            ({ id }) => id !== message.operationId,
          );
      }
      if (
        message.type === "snapshot" ||
        message.type === "phase:updated" ||
        (message.type === "note:deleted" &&
          message.noteId === pendingFront?.noteId) ||
        (message.type === "error" &&
          message.operationId === undefined &&
          pendingFront !== null) ||
        (message.type === "note:updated" &&
          message.note.id === pendingFront?.noteId &&
          message.note.stackOrder > pendingFront.previousStackOrder)
      ) {
        updatePendingNoteFront(null);
      }
      if (message.type === "error" && message.operationId !== undefined) {
        const operation = pendingVoteOperationsRef.current.find(
          ({ id }) => id === message.operationId,
        );
        if (operation) {
          updateNotes((current) => {
            const result = (() => {
              if (
                operation.action === "add" &&
                operation.stickerId !== undefined
              ) {
                return removeVoteStickerLocally(current, operation.stickerId);
              }
              if (operation.action === "add") {
                return removeOneNoteVoteLocally(
                  current,
                  operation.noteId,
                  operation.kind,
                );
              }
              if (operation.action === "remove" && operation.sticker) {
                return restoreVoteStickerLocally(
                  current,
                  operation.noteId,
                  operation.sticker,
                );
              }
              if (
                operation.action === "move" &&
                operation.stickerId !== undefined &&
                operation.previous !== undefined
              ) {
                return moveVoteStickerLocally(
                  current,
                  operation.stickerId,
                  operation.previous.noteId,
                  operation.previous.x,
                  operation.previous.y,
                );
              }
              return voteNoteLocally(current, operation.noteId, operation.kind);
            })();
            return result.notes;
          });
          updatePendingVoteOperations((current) =>
            current.filter(({ id }) => id !== operation.id),
          );
          setVoteFeedback({ state: "failed", message: message.message });
        }
        return;
      }

      if (
        message.type === "snapshot" &&
        pendingVoteOperationsRef.current.length > 0
      ) {
        updatePendingVoteOperations(() => []);
        setVoteFeedback({
          state: "failed",
          message: "通信が切断されたため、投票状態を再同期しました。",
        });
      }

      updateNotes((current) => {
        const next = applyServerMessage(current, message, {
          draggingNoteId: null,
        });
        if (message.type !== "note:updated") return next;

        const pendingFontSize = pendingFontSizeOperationsRef.current.filter(
          ({ noteId }) => noteId === message.note.id,
        );
        const latestPendingFontSize =
          pendingFontSize[pendingFontSize.length - 1];
        const nextWithPendingFontSize = latestPendingFontSize
          ? next.map((note) =>
              note.id === message.note.id
                ? { ...note, fontSize: latestPendingFontSize.fontSize }
                : note,
            )
          : next;

        // 操作IDなしの途中応答（別のシール追加など）が先に届いても、まだ
        // 確定していない自分のシールを消さない。確定応答には同じ stickerId が
        // 含まれるので重複させず、拒否応答は上の分岐で即座に取り除く。
        const previous = current.find(({ id }) => id === message.note.id);
        if (!previous) return nextWithPendingFontSize;
        const pendingStickers = pendingVoteOperationsRef.current
          .filter(
            ({ action, noteId, stickerId }) =>
              action === "add" &&
              noteId === message.note.id &&
              stickerId !== undefined,
          )
          .flatMap(({ stickerId }) =>
            previous.dotVoteStickers.filter(({ id }) => id === stickerId),
          );
        if (pendingStickers.length === 0) return nextWithPendingFontSize;
        return nextWithPendingFontSize.map((note) =>
          note.id !== message.note.id
            ? note
            : {
                ...note,
                dotVoteStickers: [
                  ...note.dotVoteStickers,
                  ...pendingStickers.filter(
                    (sticker) =>
                      !note.dotVoteStickers.some(({ id }) => id === sticker.id),
                  ),
                ],
              },
        );
      });

      if (
        message.type === "note:updated" &&
        message.operationId !== undefined
      ) {
        const operation = pendingVoteOperationsRef.current.find(
          ({ id }) => id === message.operationId,
        );
        if (operation) {
          updatePendingVoteOperations((current) =>
            current.filter(({ id }) => id !== operation.id),
          );
          setVoteFeedback({
            state: "confirmed",
            message:
              operation.action === "remove"
                ? "投票を1票取り消しました。"
                : operation.action === "move"
                  ? "シールを移動しました。"
                  : "投票を確定しました。",
          });
        }
      }
    },
    [
      updateNotes,
      updatePendingNoteFront,
      updatePendingVoteOperations,
      transactionMove.applyMessage,
      transactionShare.applyMessage,
      finishNoteCreation,
    ],
  );

  const addNote = useCallback(
    (content?: string) => {
      send(
        content === undefined
          ? { type: "note:create" }
          : { type: "note:create", content },
      );
    },
    [send],
  );

  const requestAddNote = useCallback(
    (content?: string): string | null => {
      const context = noteCreationContextRef.current;
      if (
        !context.connected ||
        !context.canCreateNote ||
        !noteCreationSupportedRef.current ||
        noteCreationRef.current !== null
      )
        return null;
      const operationId = createNoteOperationId();
      noteCreationRef.current = { operationId, status: "pending" };
      setNoteCreationPending(true);
      setNoteCreationReceipt(null);
      setNoteCreationFailure(null);
      if (
        send({
          type: "note:create",
          operationId,
          ...(content === undefined ? {} : { content }),
        }) === false
      ) {
        finishNoteCreation();
        setNoteCreationFailure({
          operationId,
          message: "接続を確認できなかったため、付箋を追加できませんでした。",
        });
        return null;
      }
      noteCreationTimerRef.current = setTimeout(() => {
        const creation = noteCreationRef.current;
        if (!creation || creation.operationId !== operationId) return;
        creation.status = "unknown";
        setNoteCreationReceipt(null);
        // 操作は再送せず、接続を更新してsnapshotだけを確認する。
        unknownCreationCallbackRef.current?.();
      }, NOTE_CREATION_RESPONSE_TIMEOUT_MS);
      return operationId;
    },
    [createNoteOperationId, finishNoteCreation, send],
  );

  const publishNote = useCallback(
    (noteId: string, x: number, y: number) => {
      transactionShare.commit({ type: "note:publish", noteId, x, y });
    },
    [transactionShare.commit],
  );

  const unpublishNote = useCallback(
    (noteId: string, privateIndex?: number) => {
      // 同じ接続で移動の解除→非公開化の順に送り、移動のlockを残さない。
      if (transactionMove.owns(noteId)) transactionMove.cancel(noteId);
      if (pendingNoteFrontRef.current?.noteId === noteId) {
        updatePendingNoteFront(null);
      }
      transactionShare.commit(
        privateIndex === undefined
          ? { type: "note:unpublish", noteId }
          : { type: "note:unpublish", noteId, privateIndex },
      );
    },
    [
      transactionShare.commit,
      updatePendingNoteFront,
      transactionMove.owns,
      transactionMove.cancel,
    ],
  );

  const startNoteDrag = useCallback(
    (noteId: string, selectedNoteIds?: readonly string[]) => {
      if (transactionShare.owns(noteId)) return;
      transactionMove.start(noteId, selectedNoteIds);
    },
    [transactionMove.start, transactionShare.owns],
  );

  const bringNoteToFront = useCallback(
    (noteId: string) => {
      const note = notesRef.current.find(({ id }) => id === noteId);
      if (!note) return;
      updatePendingNoteFront({
        noteId,
        previousStackOrder: note.stackOrder,
      });
      send({ type: "note:bring-to-front", noteId });
    },
    [send, updatePendingNoteFront],
  );

  const moveNote = transactionMove.move;
  const endNoteDrag = transactionMove.end;
  const cancelNoteDrag = transactionMove.cancel;

  const excludeNote = useCallback(
    (noteId: string) => send({ type: "note:exclude", noteId }),
    [send],
  );

  const restoreNote = useCallback(
    (noteId: string) => send({ type: "note:restore", noteId }),
    [send],
  );

  const changeNoteFontSize = useCallback(
    (noteId: string, fontSize: number) => {
      if (!NoteFontSizeSchema.safeParse(fontSize).success) return;
      if (!notesRef.current.some((note) => note.id === noteId)) return;
      const operationId = createFontSizeOperationId();
      pendingFontSizeOperationsRef.current = [
        ...pendingFontSizeOperationsRef.current,
        { id: operationId, noteId, fontSize },
      ];
      updateNotes((current) =>
        current.map((note) =>
          note.id === noteId ? { ...note, fontSize } : note,
        ),
      );
      send({
        type: "note:update-font-size",
        noteId,
        fontSize,
        operationId,
      });
    },
    [createFontSizeOperationId, updateNotes, send],
  );

  const bulkExcludeZeroVoteCandidates = useCallback(
    () => send({ type: "note:bulk-exclude" }),
    [send],
  );

  const bulkRestoreCandidates = useCallback(
    (operationId: string) => send({ type: "note:bulk-restore", operationId }),
    [send],
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      send({ type: "note:delete", noteId });
    },
    [send],
  );

  const voteNote = useCallback(
    (noteId: string, kind: DotVoteKind, x = 0.5, y = 0.5) => {
      const sticker: DotVoteSticker = {
        id: createVoteStickerId(),
        kind,
        x,
        y,
      };
      const result = addVoteStickerLocally(notesRef.current, noteId, sticker);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      const operation: PendingVoteOperation = {
        id: createVoteOperationId(),
        noteId,
        stickerId: sticker.id,
        kind,
        action: "add",
      };
      updatePendingVoteOperations((current) => [...current, operation]);
      setVoteFeedback(null);
      send({
        type: "note:vote-sticker:add",
        noteId,
        stickerId: sticker.id,
        kind,
        x,
        y,
        operationId: operation.id,
      });
    },
    [
      createVoteOperationId,
      createVoteStickerId,
      send,
      updatePendingVoteOperations,
    ],
  );

  const removeNoteVote = useCallback(
    (noteId: string, kind: DotVoteKind) => {
      const result = removeOneNoteVoteLocally(notesRef.current, noteId, kind);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      const operation: PendingVoteOperation = {
        id: createVoteOperationId(),
        noteId,
        kind,
        action: "remove",
      };
      updatePendingVoteOperations((current) => [...current, operation]);
      setVoteFeedback(null);
      send({
        type: "note:vote-remove",
        noteId,
        kind,
        operationId: operation.id,
      });
    },
    [createVoteOperationId, send, updatePendingVoteOperations],
  );

  const removeVoteSticker = useCallback(
    (stickerId: string) => {
      if (
        pendingVoteOperationsRef.current.some(
          (operation) => operation.stickerId === stickerId,
        )
      ) {
        return;
      }
      const current = notesRef.current;
      const note = current.find((candidate) =>
        candidate.dotVoteStickers.some((sticker) => sticker.id === stickerId),
      );
      const sticker = note?.dotVoteStickers.find(
        (candidate) => candidate.id === stickerId,
      );
      if (!note || !sticker) return;

      const result = removeVoteStickerLocally(current, stickerId);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      const operation: PendingVoteOperation = {
        id: createVoteOperationId(),
        noteId: note.id,
        stickerId,
        kind: sticker.kind,
        action: "remove",
        sticker,
      };
      updatePendingVoteOperations((pending) => [...pending, operation]);
      setVoteFeedback(null);
      send({
        type: "note:vote-sticker:remove",
        stickerId,
        operationId: operation.id,
      });
    },
    [createVoteOperationId, send, updatePendingVoteOperations],
  );

  const moveVoteSticker = useCallback(
    (stickerId: string, noteId: string, x: number, y: number) => {
      if (
        pendingVoteOperationsRef.current.some(
          (operation) => operation.stickerId === stickerId,
        )
      ) {
        return;
      }
      const current = notesRef.current;
      const source = current.find((note) =>
        note.dotVoteStickers.some((sticker) => sticker.id === stickerId),
      );
      const sticker = source?.dotVoteStickers.find(
        (candidate) => candidate.id === stickerId,
      );
      if (!source || !sticker) return;

      const result = moveVoteStickerLocally(current, stickerId, noteId, x, y);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      const operation: PendingVoteOperation = {
        id: createVoteOperationId(),
        noteId,
        stickerId,
        kind: sticker.kind,
        action: "move",
        previous: { noteId: source.id, x: sticker.x, y: sticker.y },
      };
      updatePendingVoteOperations((pending) => [...pending, operation]);
      setVoteFeedback(null);
      send({
        type: "note:vote-sticker:move",
        stickerId,
        noteId,
        x,
        y,
        operationId: operation.id,
      });
    },
    [createVoteOperationId, send, updatePendingVoteOperations],
  );

  const resetNoteVote = useCallback(
    (noteId: string, kind: DotVoteKind) => {
      const result = resetNoteVoteLocally(notesRef.current, noteId, kind);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      send({
        type: "note:vote-reset",
        noteId,
        kind,
        operationId: createVoteOperationId(),
      });
    },
    [send, createVoteOperationId],
  );

  const withdrawAllVotesOfKind = useCallback(
    (kind: DotVoteKind) => {
      const result = withdrawOwnVotesOfKindLocally(notesRef.current, kind);
      if (result.noteIds.length === 0) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      setVoteFeedback(null);
      for (const noteId of result.noteIds) {
        send({
          type: "note:vote-reset",
          noteId,
          kind,
          operationId: createVoteOperationId(),
        });
      }
    },
    [send, createVoteOperationId],
  );

  return {
    notes: transactionShare.renderNotes(transactionMove.notes),
    clearPeerMoves: transactionMove.clearPeerMoves,
    movePending: transactionMove.pending || transactionShare.pending,
    sharePending: transactionShare.pending,
    lastShareReceipt: transactionShare.receipt,
    moveFeedback: transactionShare.feedback ?? transactionMove.feedback,
    lastMoveReceipt: transactionMove.receipt,
    snapshotVersion,
    draggingNoteId: transactionMove.draggingNoteId,
    frontNoteId:
      transactionMove.frontNoteId ?? pendingNoteFront?.noteId ?? null,
    applyMessage,
    addNote,
    requestAddNote,
    noteCreationPending,
    noteCreationSupported,
    noteCreationReceipt,
    noteCreationFailure,
    publishNote,
    unpublishNote,
    startNoteDrag,
    bringNoteToFront,
    moveNote,
    endNoteDrag,
    cancelNoteDrag,
    excludeNote,
    restoreNote,
    bulkExcludeZeroVoteCandidates,
    bulkRestoreCandidates,
    changeNoteFontSize,
    deleteNote,
    voteNote,
    removeNoteVote,
    removeVoteSticker,
    moveVoteSticker,
    resetNoteVote,
    withdrawAllVotesOfKind,
    pendingVoteOperations,
    voteFeedback,
  };
}

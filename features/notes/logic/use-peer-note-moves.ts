"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProtocolNote, ServerMessage } from "@/contracts/room-protocol";

type PreviewMessage = Extract<ServerMessage, { type: "notes:move-preview" }>;
type Preview = PreviewMessage & { expiresAt: number };
// 確定notesを変更せず、現在の版が全件一致する操作の座標だけ重ねる。
export function usePeerNoteMoves(notes: ProtocolNote[]) {
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const phaseRevision = useRef(0);
  const previews = useRef(new Map<string, Preview>());
  const sequences = useRef(new Map<string, number>());
  const ended = useRef(new Set<string>());
  const [published, setPublished] = useState<Preview[]>([]);
  const publish = useCallback(
    () => setPublished([...previews.current.values()]),
    [],
  );
  const clear = useCallback(() => {
    for (const id of previews.current.keys()) ended.current.add(id);
    previews.current.clear();
    publish();
  }, [publish]);
  useEffect(() => {
    const timer = setInterval(() => {
      let changed = false;
      for (const [id, preview] of previews.current) {
        if (preview.expiresAt <= performance.now()) {
          previews.current.delete(id);
          changed = true;
        }
      }
      if (changed) publish();
    }, 250);
    return () => clearInterval(timer);
  }, [publish]);
  const valid = useCallback(
    (preview: Preview, current: ProtocolNote[]) =>
      preview.phaseRevision === phaseRevision.current &&
      preview.expiresAt > performance.now() &&
      preview.positions.every((position) =>
        current.some(
          (note) =>
            note.id === position.noteId &&
            note.visibility === "shared" &&
            (note.positionRevision ?? 0) === position.positionRevision &&
            (note.visibilityRevision ?? 0) === position.visibilityRevision,
        ),
      ),
    [],
  );
  const applyMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === "notes:move-preview") {
        if (
          ended.current.has(message.operationId) ||
          (sequences.current.get(message.operationId) ?? 0) >=
            message.sequence ||
          !valid(
            { ...message, expiresAt: performance.now() + message.leaseMs },
            notesRef.current,
          )
        )
          return;
        const ids = new Set(
          message.positions.map((position) => position.noteId),
        );
        // 同じ対象の新操作が来ても、古い終了は新操作へ影響しない。
        for (const [id, preview] of previews.current) {
          if (
            id !== message.operationId &&
            preview.positions.some((position) => ids.has(position.noteId))
          ) {
            previews.current.delete(id);
            ended.current.add(id);
          }
        }
        sequences.current.set(message.operationId, message.sequence);
        previews.current.set(message.operationId, {
          ...message,
          expiresAt: performance.now() + message.leaseMs,
        });
        publish();
      } else if (message.type === "notes:move-ended") {
        ended.current.add(message.operationId);
        previews.current.delete(message.operationId);
        publish();
      } else if (message.type === "notes:moved") {
        for (const [id, preview] of previews.current) {
          if (
            id === message.operationId ||
            preview.positions.some((position) =>
              message.notes.some(
                (note) =>
                  note.id === position.noteId &&
                  ((note.positionRevision ?? 0) !== position.positionRevision ||
                    (note.visibilityRevision ?? 0) !==
                      position.visibilityRevision),
              ),
            )
          ) {
            ended.current.add(id);
            previews.current.delete(id);
          }
        }
        if (message.operationId) ended.current.add(message.operationId);
        publish();
      } else if (
        message.type === "snapshot" ||
        message.type === "phase:updated"
      ) {
        phaseRevision.current = message.phaseRevision;
        clear();
      } else if (
        message.type === "outcome:published" ||
        message.type === "member:removed" ||
        (message.type === "decision:updated" && message.decision !== null)
      )
        clear();
      else if (message.type === "member_left") {
        for (const [id, preview] of previews.current) {
          if (preview.userId === message.userId) {
            ended.current.add(id);
            previews.current.delete(id);
          }
        }
        publish();
      } else if (
        message.type === "note:deleted" ||
        message.type === "note:updated"
      ) {
        for (const [id, preview] of previews.current) {
          if (
            preview.positions.some((position) =>
              message.type === "note:deleted"
                ? position.noteId === message.noteId
                : position.noteId === message.note.id &&
                  (message.note.visibility !== "shared" ||
                    (message.note.positionRevision ?? 0) !==
                      position.positionRevision ||
                    (message.note.visibilityRevision ?? 0) !==
                      position.visibilityRevision),
            )
          ) {
            ended.current.add(id);
            previews.current.delete(id);
          }
        }
        publish();
      }
    },
    [clear, publish, valid],
  );
  const renderedNotes = useMemo(() => {
    const positions = new Map<string, Preview["positions"][number]>();
    for (const preview of published) {
      if (!valid(preview, notes)) continue;
      for (const position of preview.positions)
        positions.set(position.noteId, position);
    }
    return notes.map((note) => {
      const position = positions.get(note.id);
      return position ? { ...note, x: position.x, y: position.y } : note;
    });
  }, [notes, published, valid]);
  return { notes: renderedNotes, applyMessage, clear };
}

"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DRAG_BROADCAST_THROTTLE_MS } from "@/contracts/board";
import {
  clampGroupDelta,
  getGroupMoveTargets,
  type RenderGroup,
} from "@/contracts/grouping";
import type {
  ClientMessage,
  ProtocolNote,
  ServerMessage,
} from "@/contracts/room-protocol";
import { createThrottled } from "@/lib/throttle";

type Point = { x: number; y: number };
type Operation = {
  dragId: string;
  pointerId: number;
  group: RenderGroup;
  notes: ProtocolNote[];
  origin: Point;
  delta: Point;
  sequence: number;
  status: "pending" | "active" | "ending";
};
export type MovingGroup = {
  dragId: string;
  group: RenderGroup;
  noteIds: string[];
};
type Args = {
  notes: ProtocolNote[];
  enabled: boolean;
  send?: (message: ClientMessage) => void;
  viewportRef: RefObject<HTMLDivElement | null>;
  worldPointFromClient: (x: number, y: number) => Point | null;
  lockCamera: (locked: boolean) => void;
  onRejected: () => void;
};

export type GroupDragControls = {
  start: (
    group: RenderGroup,
    event: ReactPointerEvent<HTMLDivElement>,
    origin: Point,
  ) => void;
  move: (event: ReactPointerEvent<HTMLDivElement>) => void;
  end: (event: ReactPointerEvent<HTMLDivElement>) => void;
  cancel: () => void;
  applyMessage: (message: ServerMessage) => boolean;
  renderedNotes: ProtocolNote[];
  movingGroups: MovingGroup[];
  isDragging: boolean;
  draggingNoteId: string | null;
};

export function useGroupDrag({
  notes,
  enabled,
  send,
  viewportRef,
  worldPointFromClient,
  lockCamera,
  onRejected,
}: Args): GroupDragControls {
  const [operation, setOperation] = useState<Operation | null>(null);
  const operationRef = useRef<Operation | null>(null);
  const [movingGroups, setMovingGroups] = useState<MovingGroup[]>([]);
  const versionsRef = useRef(new Map<string, number>());
  const closedIdsRef = useRef(new Set<string>());
  const awaitingFinalIdsRef = useRef(new Set<string>());

  const rememberClosed = useCallback((dragId: string) => {
    closedIdsRef.current.add(dragId);
    if (closedIdsRef.current.size > 256) {
      const oldest = closedIdsRef.current.values().next().value;
      if (oldest) {
        closedIdsRef.current.delete(oldest);
        awaitingFinalIdsRef.current.delete(oldest);
      }
    }
    versionsRef.current.delete(dragId);
  }, []);

  const sendMovement = useMemo(
    () =>
      createThrottled((delta: Point) => {
        const current = operationRef.current;
        if (current?.status !== "active") return;
        current.sequence++;
        send?.({
          type: "group:drag:move",
          dragId: current.dragId,
          sequence: current.sequence,
          delta,
        });
      }, DRAG_BROADCAST_THROTTLE_MS),
    [send],
  );

  const releasePointer = useCallback(
    (pointerId: number) => {
      const viewport = viewportRef.current;
      if (viewport?.hasPointerCapture?.(pointerId))
        viewport.releasePointerCapture(pointerId);
    },
    [viewportRef],
  );

  const reset = useCallback(
    (sendCancel = true, clearRemote = false) => {
      sendMovement.cancel();
      const current = operationRef.current;
      operationRef.current = null;
      setOperation(null);
      lockCamera(false);
      if (current) {
        rememberClosed(current.dragId);
        if (sendCancel) {
          awaitingFinalIdsRef.current.add(current.dragId);
          send?.({
            type: "group:drag:end",
            dragId: current.dragId,
            sequence: ++current.sequence,
            delta: null,
          });
        }
        releasePointer(current.pointerId);
        setMovingGroups((groups) =>
          groups.filter((group) => group.dragId !== current.dragId),
        );
      }
      if (clearRemote) {
        setMovingGroups([]);
        versionsRef.current.clear();
      }
    },
    [lockCamera, releasePointer, rememberClosed, send, sendMovement],
  );

  useEffect(() => {
    if (!enabled) reset(true, true);
  }, [enabled, reset]);

  useEffect(() => {
    const stop = () => reset();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && operationRef.current) {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener("blur", stop);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("blur", stop);
      window.removeEventListener("keydown", onKeyDown);
      sendMovement.cancel();
    };
  }, [reset, sendMovement]);

  const start = useCallback(
    (
      group: RenderGroup,
      event: ReactPointerEvent<HTMLDivElement>,
      origin: Point,
    ): void => {
      if (
        !enabled ||
        !send ||
        operationRef.current ||
        !group.representativeNoteId
      )
        return;
      const targets = getGroupMoveTargets(notes, group);
      const worldOrigin = worldPointFromClient(origin.x, origin.y);
      const point = worldPointFromClient(event.clientX, event.clientY);
      if (targets.length < 2 || !worldOrigin || !point) return;
      event.preventDefault();
      lockCamera(true);
      const current: Operation = {
        dragId: crypto.randomUUID(),
        pointerId: event.pointerId,
        group,
        notes: targets,
        origin: worldOrigin,
        delta: clampGroupDelta(targets, {
          x: point.x - worldOrigin.x,
          y: point.y - worldOrigin.y,
        }),
        sequence: 0,
        status: "pending",
      };
      operationRef.current = current;
      setOperation(current);
      viewportRef.current?.setPointerCapture?.(event.pointerId);
      send({
        type: "group:drag:start",
        dragId: current.dragId,
        anchorNoteId: group.representativeNoteId,
        bounds: {
          x: group.x,
          y: group.y,
          width: group.width,
          height: group.height,
        },
        positions: targets.map(({ id, x, y }) => ({ noteId: id, x, y })),
      });
    },
    [enabled, lockCamera, notes, send, viewportRef, worldPointFromClient],
  );

  const move = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const current = operationRef.current;
      if (
        !current ||
        current.pointerId !== event.pointerId ||
        current.status === "ending"
      )
        return;
      if (event.buttons === 0) {
        reset();
        return;
      }
      const bounds = viewportRef.current?.getBoundingClientRect();
      if (
        bounds &&
        (event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom)
      ) {
        reset();
        return;
      }
      const point = worldPointFromClient(event.clientX, event.clientY);
      if (!point) return;
      const next = {
        ...current,
        delta: clampGroupDelta(current.notes, {
          x: point.x - current.origin.x,
          y: point.y - current.origin.y,
        }),
      };
      operationRef.current = next;
      setOperation(next);
      if (next.status === "active") sendMovement(next.delta);
    },
    [reset, sendMovement, viewportRef, worldPointFromClient],
  );

  const end = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const current = operationRef.current;
      if (
        !current ||
        current.pointerId !== event.pointerId ||
        current.status === "ending"
      )
        return;
      if (current.status === "pending") {
        reset();
        return;
      }
      const point = worldPointFromClient(event.clientX, event.clientY);
      const delta = point
        ? clampGroupDelta(current.notes, {
            x: point.x - current.origin.x,
            y: point.y - current.origin.y,
          })
        : current.delta;
      const next: Operation = {
        ...current,
        delta,
        sequence: current.sequence + 1,
        status: "ending",
      };
      operationRef.current = next;
      setOperation(next);
      sendMovement.cancel();
      releasePointer(event.pointerId);
      send?.({
        type: "group:drag:end",
        dragId: next.dragId,
        sequence: next.sequence,
        delta,
      });
    },
    [releasePointer, reset, send, sendMovement, worldPointFromClient],
  );

  const applyMessage = useCallback(
    (message: ServerMessage): boolean => {
      if (
        message.type === "snapshot" ||
        message.type === "phase:updated" ||
        message.type === "outcome:published"
      ) {
        reset(message.type === "snapshot", true);
        if (message.type === "snapshot") {
          const frames = (message.groupDrags ?? []).filter(
            ({ dragId }) => !closedIdsRef.current.has(dragId),
          );
          for (const frame of frames)
            versionsRef.current.set(frame.dragId, frame.sequence);
          setMovingGroups(
            frames.map(({ dragId, group, noteIds }) => ({
              dragId,
              group,
              noteIds,
            })),
          );
        }
        return true;
      }
      if (message.type === "error" && operationRef.current) {
        reset();
        return true;
      }
      if (message.type === "group:drag:result") {
        const current = operationRef.current;
        if (!current || current.dragId !== message.dragId) return true;
        if (!message.accepted) {
          reset(false);
          onRejected();
        } else if (current.status === "pending") {
          const next: Operation = { ...current, status: "active" };
          operationRef.current = next;
          setOperation(next);
          sendMovement(next.delta);
        }
        return true;
      }
      if (message.type !== "group:drag:updated") return true;
      if (closedIdsRef.current.has(message.dragId)) {
        if (message.ended && awaitingFinalIdsRef.current.delete(message.dragId))
          return true;
        return false;
      }
      const version = versionsRef.current.get(message.dragId);
      if (
        version !== undefined &&
        message.sequence <= version &&
        !message.ended
      )
        return false;
      if (message.ended) {
        rememberClosed(message.dragId);
        setMovingGroups((groups) =>
          groups.filter((group) => group.dragId !== message.dragId),
        );
        if (operationRef.current?.dragId === message.dragId) {
          const pointerId = operationRef.current.pointerId;
          operationRef.current = null;
          setOperation(null);
          sendMovement.cancel();
          lockCamera(false);
          releasePointer(pointerId);
        }
      } else {
        versionsRef.current.set(message.dragId, message.sequence);
        const next: MovingGroup = {
          dragId: message.dragId,
          group: message.group,
          noteIds: message.notes.map((note) => note.id),
        };
        setMovingGroups((groups) => [
          ...groups.filter((group) => group.dragId !== message.dragId),
          next,
        ]);
      }
      return true;
    },
    [
      lockCamera,
      onRejected,
      releasePointer,
      rememberClosed,
      reset,
      sendMovement,
    ],
  );

  const showsPreview = operation && operation.status !== "pending";
  const localPositions = new Map(
    showsPreview
      ? operation.notes.map((note) => [
          note.id,
          { x: note.x + operation.delta.x, y: note.y + operation.delta.y },
        ])
      : [],
  );
  const renderedNotes = showsPreview
    ? notes.map((note) =>
        localPositions.has(note.id)
          ? { ...note, ...localPositions.get(note.id) }
          : note,
      )
    : notes;
  const frames = movingGroups.filter(
    (group) => !showsPreview || group.dragId !== operation.dragId,
  );
  if (showsPreview)
    frames.push({
      dragId: operation.dragId,
      noteIds: operation.notes.map((note) => note.id),
      group: {
        ...operation.group,
        x: operation.group.x + operation.delta.x,
        y: operation.group.y + operation.delta.y,
      },
    });

  return {
    start,
    move,
    end,
    cancel: () => reset(),
    applyMessage,
    renderedNotes,
    movingGroups: frames,
    isDragging: operation !== null,
    draggingNoteId:
      operation?.status === "active"
        ? (operation.group.representativeNoteId ?? null)
        : null,
  };
}

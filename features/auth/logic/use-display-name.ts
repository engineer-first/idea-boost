"use client";
import { useEffect, useRef, useState } from "react";
import type { SetDisplayNameInput } from "@/contracts/display-name";
import { RoomDisplayNameSchema } from "@/contracts/room-protocol";
import {
  type DisplayNameResult,
  loadDisplayName,
  saveDisplayName,
} from "./display-name-actions";

export type DisplayNameControls = {
  open: boolean;
  draft: string;
  pending: boolean;
  loading: boolean;
  error: string | null;
  request: () => Promise<void>;
  onDraftChange: (value: string) => void;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onRetry: () => Promise<void>;
};
export function useDisplayName({
  currentUserId,
  roomId,
  initialName,
  save = saveDisplayName,
}: {
  currentUserId?: string;
  roomId?: string;
  initialName?: string;
  save?: (input: SetDisplayNameInput) => Promise<DisplayNameResult>;
}): DisplayNameControls {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false),
    turn = useRef(0);
  const saving = useRef(false);
  const principal = useRef(currentUserId);
  const targetRoom = useRef(roomId);
  principal.current = currentUserId;
  targetRoom.current = roomId;
  useEffect(() => {
    principal.current = currentUserId;
    targetRoom.current = roomId;
    turn.current++;
    busy.current = false;
    saving.current = false;
    setOpen(false);
    setDraft("");
    setError(null);
    setLoading(false);
    setPending(false);
  }, [currentUserId, roomId]);
  useEffect(
    () => () => {
      turn.current++;
    },
    [],
  );
  async function load(reload = false) {
    if (busy.current) return;
    if (!currentUserId) {
      setOpen(true);
      setError("再読み込みしてログイン状態を確認してください。");
      return;
    }
    if (initialName !== undefined && !reload) {
      setDraft(initialName);
      setError(null);
      setOpen(true);
      return;
    }
    const actor = currentUserId,
      generation = ++turn.current;
    busy.current = true;
    setError(null);
    setLoading(true);
    if (!reload) setDraft("");
    setOpen(true);
    const result = await loadDisplayName(actor).catch(() => ({
      ok: false as const,
      error: "表示名を取得できませんでした。再試行してください。",
    }));
    if (
      generation !== turn.current ||
      principal.current !== actor ||
      targetRoom.current !== roomId
    )
      return;
    busy.current = false;
    setLoading(false);
    if (!result.ok) {
      setOpen(true);
      setError(result.error);
      return;
    }
    setDraft(result.name ?? "");
    setOpen(true);
  }
  async function saveCandidate(name: string) {
    if (busy.current || !currentUserId) return;
    const parsed = RoomDisplayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const actor = currentUserId,
      generation = ++turn.current;
    busy.current = true;
    setPending(true);
    saving.current = true;
    setError(null);
    const result = await save({
      expectedPrincipal: actor,
      name: parsed.data,
      ...(roomId ? { roomId } : {}),
    }).catch(() => ({
      ok: false as const,
      error: "保存結果を確認できませんでした。もう一度保存してください。",
    }));
    if (
      generation !== turn.current ||
      principal.current !== actor ||
      targetRoom.current !== roomId
    )
      return;
    busy.current = false;
    setPending(false);
    saving.current = false;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }
  return {
    open,
    draft,
    pending,
    loading,
    error,
    request: () => load(),
    onConfirm: () => saveCandidate(draft),
    onRetry: () => load(true),
    onDraftChange: (value) => {
      setDraft(value);
      setError(null);
    },
    onOpenChange: (value) => {
      if (saving.current) return;
      turn.current++;
      busy.current = false;
      setLoading(false);
      setOpen(value);
      if (!value) {
        setError(null);
      }
    },
  };
}

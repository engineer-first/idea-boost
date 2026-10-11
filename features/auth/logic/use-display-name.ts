"use client";
import { useEffect, useRef, useState } from "react";
import {
  defaultDisplayName,
  type SetDisplayNameInput,
} from "@/contracts/display-name";
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
  optional: boolean;
  request: () => Promise<void>;
  beforeEntry: (next: () => void) => Promise<void>;
  onDraftChange: (value: string) => void;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onSkip: () => void;
  onRetry: () => Promise<void>;
};
export function useDisplayName({
  currentUserId,
  initialName,
  save = saveDisplayName,
}: {
  currentUserId?: string;
  initialName?: string;
  save?: (input: SetDisplayNameInput) => Promise<DisplayNameResult>;
}): DisplayNameControls {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [optional, setOptional] = useState(false);
  const nextRef = useRef<(() => void) | null>(null),
    busy = useRef(false),
    turn = useRef(0);
  const saving = useRef(false);
  const principal = useRef(currentUserId);
  principal.current = currentUserId;
  useEffect(() => {
    principal.current = currentUserId;
    turn.current++;
    busy.current = false;
    saving.current = false;
    nextRef.current = null;
    setOpen(false);
    setDraft("");
    setError(null);
    setLoading(false);
    setPending(false);
  }, [currentUserId]);
  useEffect(
    () => () => {
      turn.current++;
    },
    [],
  );
  async function load(next: (() => void) | null, reload = false) {
    if (busy.current) return;
    if (!currentUserId) {
      setOpen(true);
      setError("再読み込みしてログイン状態を確認してください。");
      return;
    }
    if (!next && initialName !== undefined && !reload) {
      setDraft(initialName);
      setError(null);
      setOptional(false);
      setOpen(true);
      return;
    }
    const actor = currentUserId,
      generation = ++turn.current;
    busy.current = true;
    nextRef.current = next;
    setOptional(!!next);
    setError(null);
    setLoading(true);
    if (!next) {
      if (!reload) setDraft("");
      setOpen(true);
    }
    const result = await loadDisplayName(actor).catch(() => ({
      ok: false as const,
      error: "呼び名を取得できませんでした。再試行してください。",
    }));
    if (generation !== turn.current || principal.current !== actor) return;
    busy.current = false;
    setLoading(false);
    if (!result.ok) {
      setOpen(true);
      setError(result.error);
      return;
    }
    if (next && result.name !== null) {
      nextRef.current = null;
      next();
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
    }).catch(() => ({
      ok: false as const,
      error: "保存結果を確認できませんでした。もう一度保存してください。",
    }));
    if (generation !== turn.current || principal.current !== actor) return;
    busy.current = false;
    setPending(false);
    saving.current = false;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    const next = nextRef.current;
    nextRef.current = null;
    next?.();
  }
  return {
    open,
    draft,
    pending,
    loading,
    error,
    optional,
    request: () => load(null),
    beforeEntry: (next) => load(next),
    onConfirm: () => saveCandidate(draft),
    onRetry: () => load(nextRef.current, true),
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
        nextRef.current = null;
        setError(null);
      }
    },
    onSkip: () => {
      if (busy.current || !optional || !currentUserId) return;
      void saveCandidate(defaultDisplayName(currentUserId));
    },
  };
}

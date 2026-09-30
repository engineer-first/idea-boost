"use client";

import { Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RenderGroup } from "@/contracts/grouping";

export type NoteGroupCardProps = {
  group: RenderGroup;
  name: string;
  canGroupNote: boolean;
  onUpdateName: (name: string) => void;
};

function getHashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function NoteGroupCard({
  group,
  name,
  canGroupNote,
  onUpdateName,
}: NoteGroupCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localName, setLocalName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const composingRef = useRef(false);
  const [editingName, setEditingName] = useState(name);
  const [hasConflict, setHasConflict] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const pendingFocusRef = useRef(false);
  const hintId = useId();
  const conflictId = useId();

  const startEditing = () => {
    setLocalName(name);
    setEditingName(name);
    setHasConflict(false);
    setPendingName(null);
    setIsWaiting(false);
    setIsEditing(true);
  };

  const finishEditing = (restoreFocus: boolean) => {
    restoreFocusRef.current = restoreFocus;
    setHasConflict(false);
    setPendingName(null);
    setIsWaiting(false);
    composingRef.current = false;
    setIsEditing(false);
  };

  useEffect(() => {
    if (!isEditing) {
      setLocalName(name);
    }
  }, [name, isEditing]);

  useEffect(() => {
    if (!canGroupNote && isEditing && pendingName === null) {
      setIsEditing(false);
      setLocalName(name);
    }
  }, [canGroupNote, isEditing, name, pendingName]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus({ preventScroll: true });
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, [isEditing]);

  useEffect(() => {
    if (pendingName !== null && name === pendingName) {
      restoreFocusRef.current =
        pendingFocusRef.current && document.activeElement === inputRef.current;
      setPendingName(null);
      setIsWaiting(false);
      setIsEditing(false);
    }
  }, [name, pendingName]);

  useEffect(() => {
    if (!isWaiting) return;
    const timeout = setTimeout(() => setIsWaiting(false), 2000);
    return () => clearTimeout(timeout);
  }, [isWaiting]);

  const handleSubmit = (restoreFocus: boolean) => {
    if (composingRef.current || isWaiting) return;

    if (!canGroupNote) {
      return;
    }
    if (name !== editingName) {
      setHasConflict(true);
      return;
    }
    const trimmed = localName.trim();
    if (trimmed && trimmed !== name) {
      pendingFocusRef.current = restoreFocus;
      setPendingName(trimmed);
      setIsWaiting(true);
      onUpdateName(trimmed);
    } else {
      finishEditing(restoreFocus);
      setLocalName(name);
    }
  };

  // 同時グループの色被りを防ぐため contracts/grouping で計算された等分 hue を優先し、無い場合はフォールバック
  const colorSeed =
    group.persistentGroupId || group.representativeNoteId || group.id;
  const hash = getHashCode(colorSeed);
  const hue = group.hue !== undefined ? group.hue : hash % 360;

  return (
    <div
      data-testid="note-group-card"
      className="pointer-events-none absolute rounded-lg border-2 border-dashed border-[hsl(var(--group-hue),65%,42%)] bg-[hsla(var(--group-hue),65%,55%,0.07)] transition-all duration-200 ease-out"
      style={{
        left: group.x,
        top: group.y,
        width: group.width,
        height: group.height,
        // CSSカスタムプロパティを渡す
        ["--group-hue" as string]: `${hue}`,
      }}
    >
      <div
        data-testid="group-name-container"
        className="pointer-events-auto absolute bottom-full left-3 z-20 w-48 max-w-[calc(100%-1.5rem)]"
      >
        {isEditing ? (
          <>
            <input
              ref={inputRef}
              type="text"
              data-testid="group-name-input"
              value={localName}
              maxLength={50}
              readOnly={isWaiting || !canGroupNote}
              aria-busy={isWaiting || undefined}
              onChange={(e) => {
                setLocalName(e.target.value);
                setPendingName(null);
              }}
              aria-label="グループ名"
              aria-describedby={
                hasConflict ? `${hintId} ${conflictId}` : hintId
              }
              aria-invalid={hasConflict || undefined}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onBlur={() => handleSubmit(false)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit(true);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  finishEditing(true);
                  setLocalName(name);
                }
              }}
              className="w-48 max-w-full rounded border border-[hsl(var(--group-hue),65%,85%)] bg-background px-2 py-0.5 text-lg font-extrabold text-[hsl(var(--group-hue),75%,25%)] shadow-sm outline-none"
            />
            <div className="absolute top-full left-0 w-full">
              <p
                id={hintId}
                className="rounded bg-background px-2 py-1 text-xs text-foreground"
              >
                {pendingName === null
                  ? "50文字まで · Enterで確定 · Escで取消"
                  : "Escで閉じる（送信は取り消せません）"}
              </p>
              {pendingName !== null && (
                <p
                  role="status"
                  className="rounded bg-background px-2 py-1 text-sm text-foreground"
                >
                  {isWaiting
                    ? "共有への反映を確認中…"
                    : canGroupNote
                      ? "まだ反映を確認できません。入力は保持しています。Enterで再送できます。"
                      : "現在は変更できません。未反映の入力をコピーして保管できます。"}
                  <span className="block break-words">
                    現在の共有名：{name || "名前なし"}
                  </span>
                </p>
              )}
              {hasConflict && (
                <p
                  id={conflictId}
                  role="alert"
                  className="rounded bg-background px-2 py-1 text-sm text-destructive"
                >
                  {pendingName === null
                    ? "別の参加者が名前を変更しました。入力は未送信です。Escで最新名に戻して、もう一度編集してください。"
                    : "共有名が変更されました。入力を保持しています。Escで閉じて最新名を確認し、もう一度編集してください。"}
                </p>
              )}
            </div>
          </>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {canGroupNote ? (
                  <button
                    ref={buttonRef}
                    type="button"
                    className="group flex w-full cursor-pointer items-start gap-1 rounded border border-[hsl(var(--group-hue),65%,85%)] bg-background px-2 py-0.5 text-left text-lg font-extrabold text-[hsl(var(--group-hue),75%,25%)] shadow-sm select-none"
                    onClick={startEditing}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        startEditing();
                      }
                    }}
                  >
                    <span
                      data-testid="group-name-display"
                      className="line-clamp-2 min-w-0 flex-1 break-words text-lg font-extrabold text-[hsl(var(--group-hue),75%,25%)]"
                    >
                      {name || "グループに名前を付ける"}
                    </span>
                    <Pencil
                      aria-hidden="true"
                      data-testid="group-name-pencil"
                      className="mt-1 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    />
                  </button>
                ) : (
                  <div className="flex w-full items-start rounded border border-[hsl(var(--group-hue),65%,85%)] bg-background px-2 py-0.5 text-lg font-extrabold text-[hsl(var(--group-hue),75%,25%)] shadow-sm select-none">
                    <span
                      data-testid="group-name-display"
                      className="line-clamp-2 min-w-0 flex-1 break-words text-lg font-extrabold text-[hsl(var(--group-hue),75%,25%)]"
                    >
                      {name || "名前なし"}
                    </span>
                  </div>
                )}
              </TooltipTrigger>
              <TooltipContent className="max-w-[min(20rem,calc(100vw-2rem))] break-words">
                {name || "グループに名前を付ける"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

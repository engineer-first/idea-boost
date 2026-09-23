"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (!isEditing) {
      setLocalName(name);
    }
  }, [name, isEditing]);

  useEffect(() => {
    if (!canGroupNote && isEditing) {
      setIsEditing(false);
      setLocalName(name);
    }
  }, [canGroupNote, isEditing, name]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    setIsEditing(false);

    if (!canGroupNote) {
      setLocalName(name);
      return;
    }

    const trimmed = localName.trim();
    if (trimmed && trimmed !== name) {
      onUpdateName(trimmed);
    } else {
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
      {name !== "" && (
        <div
          data-testid="group-name-container"
          className="pointer-events-auto absolute bottom-full left-3 w-48 max-w-[calc(100%-1.5rem)]"
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              data-testid="group-name-input"
              value={localName}
              maxLength={50}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={handleSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSubmit();
                } else if (e.key === "Escape") {
                  setIsEditing(false);
                  setLocalName(name);
                }
              }}
              className="w-48 max-w-full rounded border border-[hsl(var(--group-hue),65%,85%)] bg-background px-2 py-0.5 text-lg font-extrabold text-[hsl(var(--group-hue),75%,25%)] shadow-sm outline-none"
            />
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {canGroupNote ? (
                    <button
                      type="button"
                      className="group flex w-full cursor-pointer items-start gap-1 rounded border border-[hsl(var(--group-hue),65%,85%)] bg-background px-2 py-0.5 text-left text-lg font-extrabold text-[hsl(var(--group-hue),75%,25%)] shadow-sm select-none"
                      onClick={() => setIsEditing(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setIsEditing(true);
                        }
                      }}
                    >
                      <span
                        data-testid="group-name-display"
                        className="line-clamp-2 min-w-0 flex-1 break-words text-lg font-extrabold text-[hsl(var(--group-hue),75%,25%)]"
                      >
                        {name}
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
                        {name}
                      </span>
                    </div>
                  )}
                </TooltipTrigger>
                <TooltipContent>{name}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
    </div>
  );
}

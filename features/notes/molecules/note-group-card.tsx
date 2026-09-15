"use client";

import { useEffect, useRef, useState } from "react";
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
      className="pointer-events-none absolute rounded-lg border-2 border-dashed border-[hsl(var(--group-hue),65%,55%)] bg-[hsla(var(--group-hue),65%,55%,0.03)] transition-all duration-200 ease-out dark:border-[hsl(var(--group-hue),55%,45%)] dark:bg-[hsla(var(--group-hue),55%,45%,0.03)]"
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
        // biome-ignore lint/a11y/useSemanticElements: input element is nested during editing, so we use a div with role="button" instead of button
        <div
          role="button"
          tabIndex={isEditing ? -1 : 0}
          className="pointer-events-auto absolute -top-4 left-3 cursor-pointer rounded border border-[hsl(var(--group-hue),65%,85%)] bg-background px-2 py-0.5 text-sm font-bold text-[hsl(var(--group-hue),75%,35%)] shadow-sm select-none dark:border-[hsl(var(--group-hue),55%,30%)] dark:text-[hsl(var(--group-hue),55%,70%)]"
          onClick={() => {
            if (canGroupNote && !isEditing) {
              setIsEditing(true);
            }
          }}
          onKeyDown={(e) => {
            if (
              canGroupNote &&
              !isEditing &&
              (e.key === "Enter" || e.key === " ")
            ) {
              e.preventDefault();
              setIsEditing(true);
            }
          }}
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
              className="w-32 bg-transparent text-sm font-bold outline-none text-[hsl(var(--group-hue),75%,35%)] dark:text-[hsl(var(--group-hue),55%,70%)]"
            />
          ) : (
            name
          )}
        </div>
      )}
    </div>
  );
}

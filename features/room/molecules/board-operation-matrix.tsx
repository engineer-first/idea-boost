"use client";

import { Move, Pencil, Trash2 } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { BoardPermissions } from "../logic/board-permissions";

type BoardOperationMatrixProps = {
  permissions: Pick<
    BoardPermissions,
    "canEditNote" | "canMoveNote" | "canDeleteNote"
  >;
};

const OPERATIONS = [
  { key: "canEditNote", label: "編集", icon: Pencil },
  { key: "canMoveNote", label: "移動", icon: Move },
  { key: "canDeleteNote", label: "削除", icon: Trash2 },
] as const;

export function BoardOperationMatrix({
  permissions,
}: BoardOperationMatrixProps) {
  return (
    <div className="rounded-lg border bg-background/95 px-3 py-2 shadow-sm backdrop-blur-sm">
      <TooltipProvider>
        <div className="flex items-center gap-4">
          {OPERATIONS.map((operation) => {
            const enabled = permissions[operation.key];
            const Icon = operation.icon;

            return (
              <Tooltip key={operation.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`付箋の${operation.label}`}
                    className="flex items-center gap-1.5 text-sm font-medium"
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    <span
                      aria-hidden="true"
                      className={`size-2 rounded-full ${
                        enabled ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  付箋の{operation.label}：{enabled ? "可能" : "不可"}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}

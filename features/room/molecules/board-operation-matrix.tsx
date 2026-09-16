"use client";

import { Circle, Move, Pencil, Trash2, X } from "lucide-react";

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
    <div className="board-hud rounded-lg border bg-background px-3 py-2 shadow-sm">
      <TooltipProvider>
        <div className="flex items-center gap-4">
          {OPERATIONS.map((operation) => {
            const enabled = permissions[operation.key];
            const Icon = operation.icon;
            const StatusIcon = enabled ? Circle : X;
            const statusLabel = enabled ? "可能" : "不可";

            return (
              <Tooltip key={operation.key}>
                <TooltipTrigger asChild>
                  <span
                    role="img"
                    aria-label={`付箋の${operation.label}：${statusLabel}`}
                    className="flex flex-col items-center gap-1 text-sm font-medium"
                  >
                    <span className="relative flex size-6 items-center justify-center">
                      <Icon aria-hidden="true" className="size-4" />
                      <StatusIcon
                        aria-hidden="true"
                        data-testid={`board-operation-status-${operation.key}`}
                        data-status={enabled ? "allowed" : "blocked"}
                        className={`absolute -right-1 -bottom-1 size-3.5 stroke-[3] ${
                          enabled ? "text-green-600" : "text-red-600"
                        }`}
                      />
                    </span>
                    <span>{operation.label}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  付箋の{operation.label}：{statusLabel}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}

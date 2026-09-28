"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SharingState } from "@/contracts/room-protocol";
import { MemberAvatar } from "@/features/room-members";

export type SharingPresenterProps = {
  sharing: SharingState;
  hostUserId: string;
};

export function SharingPresenter({
  sharing,
  hostUserId,
}: SharingPresenterProps) {
  const current = sharing.order[sharing.currentIndex ?? sharing.results.length];
  const next =
    sharing.currentIndex === null
      ? undefined
      : sharing.order[sharing.currentIndex + 1];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label="発表者と全体の順番を確認"
          className="h-11 w-[250px] min-w-0 shrink-0 gap-2 rounded-xl border-blue-200 bg-blue-50 px-2 text-left hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 max-[900px]:min-w-[220px] max-[900px]:flex-1"
        >
          {current && (
            <MemberAvatar name={current.name} color={current.color} size={28} />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">
              {sharing.status === "complete"
                ? "一巡しました"
                : sharing.status === "ready"
                  ? "一人ずつ共有します"
                  : current?.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {sharing.status === "complete"
                ? "結果と順番を見る"
                : sharing.status === "ready"
                  ? `最初 ${current?.name ?? ""}`
                  : next
                    ? `次 ${next.name}`
                    : "この人で最後"}
            </span>
          </span>
          <span className="shrink-0 text-right text-xs tabular-nums">
            {sharing.currentIndex === null
              ? sharing.results.length
              : sharing.currentIndex + 1}
            /{sharing.order.length}
            <span className="block text-[10px] text-blue-700 dark:text-blue-300">
              3回共通
            </span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" aria-label="共有する順番">
        <p className="mb-3 text-sm font-semibold">
          共有する順番{" "}
          <span className="text-xs font-normal text-muted-foreground">
            3回共通
          </span>
        </p>
        <ol className="max-h-72 space-y-3 overflow-y-auto">
          {sharing.order.map((member, index) => (
            <li key={member.userId} className="flex items-center gap-2 text-xs">
              <MemberAvatar name={member.name} color={member.color} size={28} />
              <span className="min-w-0 flex-1 break-words">
                {index + 1}. {member.name}
                {member.userId === hostUserId && (
                  <span className="block text-muted-foreground">進行役</span>
                )}
              </span>
              <span className="shrink-0">
                {sharing.results[index] === "passed"
                  ? "今回はパス"
                  : sharing.results[index] === "done"
                    ? "発表済み"
                    : index === sharing.currentIndex
                      ? "発表中"
                      : "これから"}
              </span>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}

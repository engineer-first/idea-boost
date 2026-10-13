"use client";

import { ArrowRight, Minus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ProtocolMember, SharingState } from "@/contracts/room-protocol";
import {
  MemberAvatar,
  MemberSelection,
  NOTE_COLOR_NAMES,
} from "@/features/room-members";

export type SharingPresenterProps = {
  sharing: SharingState;
  hostUserId: string;
  currentUserId?: string;
  onEditSelf?: () => void;
  onSelectHostTarget?: (userId: string) => void;
  selectionDisabled?: boolean;
  members?: ProtocolMember[];
};

export function SharingPresenter({
  sharing,
  hostUserId,
  currentUserId,
  onSelectHostTarget,
  onEditSelf,
  selectionDisabled = false,
  members = sharing.order,
}: SharingPresenterProps) {
  const descriptionId = useId();
  const orderRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const current = sharing.order[sharing.currentIndex ?? sharing.results.length];
  const isActive = sharing.status === "active";
  const currentStatusLabel =
    sharing.startsAt !== null ? "まもなく発表" : "発表中";
  const currentPresenterId = current?.userId;
  useEffect(() => {
    const currentElement = orderRef.current?.querySelector<HTMLElement>(
      `[data-user-id="${currentPresenterId}"]`,
    );
    currentElement?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [currentPresenterId]);
  const otherMembers = members.filter(
    (member) => !sharing.order.some((entry) => entry.userId === member.userId),
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label="発表者と全体の順番を確認"
          data-host-transfer-origin
          aria-describedby={descriptionId}
          className="h-11 w-[250px] min-w-0 shrink-0 gap-2 rounded-xl border-blue-200 bg-blue-50 px-2 text-left hover:bg-blue-100 max-[900px]:min-w-[220px] max-[900px]:flex-1"
        >
          <span
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
            data-testid="sharing-order"
            ref={orderRef}
          >
            {sharing.order.map((member, index) => {
              const result = sharing.results[index];
              const isCurrent = isActive && index === sharing.currentIndex;
              return (
                <span
                  key={member.userId}
                  className="flex shrink-0 items-center gap-1"
                >
                  {index > 0 ? (
                    <ArrowRight
                      aria-hidden="true"
                      className="size-3 shrink-0 text-blue-400"
                    />
                  ) : null}
                  <span
                    className="relative flex shrink-0 items-center"
                    data-current={isCurrent ? "true" : undefined}
                    data-user-id={member.userId}
                    data-sharing-result={result ?? undefined}
                  >
                    <MemberAvatar
                      name={member.name}
                      color={member.color}
                      size={isCurrent ? 30 : 26}
                      isVotingComplete={result === "done"}
                      completionLabel="発表済み"
                    />
                    {result === "passed" ? (
                      <span
                        className="absolute -bottom-1 -right-1 inline-flex size-3.5 items-center justify-center rounded-full border border-background bg-slate-600 text-white"
                        role="img"
                        aria-label="パス"
                      >
                        <Minus aria-hidden="true" className="size-2.5" />
                      </span>
                    ) : null}
                  </span>
                  {isCurrent ? (
                    <span className="min-w-0 max-w-28 text-left leading-tight">
                      <span className="block text-[10px] font-bold text-blue-700">
                        {currentStatusLabel}
                      </span>
                      <span className="block truncate text-xs font-semibold text-blue-950">
                        {member.name}
                      </span>
                    </span>
                  ) : null}
                </span>
              );
            })}
          </span>
          <span id={descriptionId} className="sr-only">
            {sharing.status === "complete"
              ? "共有完了"
              : sharing.status === "ready"
                ? "一人ずつ共有します"
                : `${currentStatusLabel}：${current?.name ?? ""}`}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        aria-label="共有する順番"
      >
        <p className="text-sm font-semibold">共有する順番</p>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          課題・問い・アイデアを同じ順番で共有します。
        </p>
        <ol className="max-h-72 space-y-3 overflow-y-auto">
          {sharing.order.map((member, index) => (
            <li key={member.userId} className="flex items-center gap-2 text-xs">
              <MemberSelection
                name={
                  member.userId === currentUserId && onEditSelf
                    ? `${member.name}：呼び名を変更`
                    : member.name
                }
                className="flex min-h-11 w-full min-w-0 items-center gap-2 p-1"
                disabled={selectionDisabled}
                onSelect={
                  member.userId === currentUserId && onEditSelf
                    ? () => {
                        setOpen(false);
                        onEditSelf();
                      }
                    : onSelectHostTarget &&
                        member.userId !== currentUserId &&
                        members.some((entry) => entry.userId === member.userId)
                      ? () => {
                          setOpen(false);
                          onSelectHostTarget(member.userId);
                        }
                      : undefined
                }
              >
                <MemberAvatar
                  name={member.name}
                  color={member.color}
                  size={28}
                />
                <span className="min-w-0 flex-1 break-words">
                  {index + 1}. {member.name}
                  {members.filter((m) => m.name === member.name).length > 1 ? (
                    <span className="block text-muted-foreground">
                      {NOTE_COLOR_NAMES[member.color]}
                    </span>
                  ) : null}
                  {member.userId === hostUserId && (
                    <span className="block text-muted-foreground">ホスト</span>
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
              </MemberSelection>
            </li>
          ))}
        </ol>
        {otherMembers.length > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1 text-xs text-muted-foreground">ほかの参加者</p>
            {otherMembers.map((member) => (
              <MemberSelection
                key={member.userId}
                name={
                  member.userId === currentUserId && onEditSelf
                    ? `${member.name}：呼び名を変更`
                    : member.name
                }
                className="flex min-h-11 w-full min-w-0 items-center gap-2 p-1"
                disabled={selectionDisabled}
                onSelect={
                  member.userId === currentUserId && onEditSelf
                    ? () => {
                        setOpen(false);
                        onEditSelf();
                      }
                    : onSelectHostTarget && member.userId !== currentUserId
                      ? () => {
                          setOpen(false);
                          onSelectHostTarget(member.userId);
                        }
                      : undefined
                }
              >
                <MemberAvatar
                  name={member.name}
                  color={member.color}
                  size={28}
                />
                <span className="min-w-0 break-words text-sm">
                  {member.name}
                </span>
                {member.userId === hostUserId ? (
                  <span className="text-xs text-muted-foreground">ホスト</span>
                ) : null}
              </MemberSelection>
            ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

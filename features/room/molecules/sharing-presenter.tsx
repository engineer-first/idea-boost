"use client";

import { ArrowRight, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/dialog";
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
  currentUserId?: string;
  onEditSelf?: () => void;
  onSelectMember?: (userId: string) => void;
  selectionDisabled?: boolean;
  members?: ProtocolMember[];
  connectedUserIds?: readonly string[];
  /** 今の発表者を{t("pass")}。渡したときだけ発表中の行に{t("pass")}を出す。 */
  onPassPresenter?: () => void;
  passDisabled?: boolean;
};

export function SharingPresenter({
  sharing,
  currentUserId,
  onSelectMember,
  onEditSelf,
  selectionDisabled = false,
  members = sharing.order,
  connectedUserIds,
  onPassPresenter,
  passDisabled = false,
}: SharingPresenterProps) {
  const t = useTranslations("app.boardSharing");
  const headerMessages = useTranslations("app.boardHeader");
  const descriptionId = useId();
  const presentIds = new Set(members.map((member) => member.userId));
  const orderRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const current = sharing.order[sharing.currentIndex ?? sharing.results.length];
  const isActive = sharing.status === "active";
  const currentStatusLabel =
    sharing.startsAt !== null ? t("startingSoon") : t("presenting");
  const currentPresenterId = current?.userId;
  // 確認中に交代したら別の人を{t("pass")}しないよう、確認を開いた時点の番と照合する。
  const [passTarget, setPassTarget] = useState<{
    userId: string;
    revision: string;
  } | null>(null);
  const passConfirmOpen =
    isActive &&
    passTarget !== null &&
    passTarget.userId === currentPresenterId &&
    passTarget.revision === sharing.revision;
  const canPassPresenter =
    onPassPresenter !== undefined &&
    isActive &&
    current !== undefined &&
    current.userId !== currentUserId;
  const requestPass = () => {
    if (!current || !onPassPresenter) return;
    setOpen(false);
    // 接続が分からない間は、離席していない人を誤って飛ばさないよう確認する。
    const connected =
      connectedUserIds === undefined ||
      connectedUserIds.includes(current.userId);
    if (connected)
      setPassTarget({ userId: current.userId, revision: sharing.revision });
    else onPassPresenter();
  };
  useEffect(() => {
    const currentElement = orderRef.current?.querySelector<HTMLElement>(
      `[data-user-id="${currentPresenterId}"]`,
    );
    // アバターの隣の「発表中」と名前まで見えるよう、ラベルを含む塊ごと寄せる。
    const target = currentElement?.parentElement ?? currentElement;
    const reveal = () =>
      target?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    reveal();
    // 並びは手で送れないため、Web フォントの読込で名前の幅が変わったときや、
    // 画面の回転・縮小で枠が狭くなったときにも寄せ直す。
    const container = orderRef.current;
    if (!target || !container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reveal);
    observer.observe(container);
    observer.observe(target);
    return () => observer.disconnect();
  }, [currentPresenterId]);
  const otherMembers = members.filter(
    (member) => !sharing.order.some((entry) => entry.userId === member.userId),
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={t("presenterOrderAria")}
          data-member-menu-origin
          aria-describedby={descriptionId}
          className="h-11 w-[250px] min-w-0 shrink-0 gap-2 rounded-lg border-border bg-primary-soft px-2 text-left hover:bg-muted max-[900px]:min-w-[220px] max-[900px]:flex-1"
        >
          {/* ボタンの中はフォーカスを置けないので、手で送るスクロール領域にしない。
              はみ出す分は隠し、今の発表者へは scrollIntoView で寄せる。全員は押して開く一覧で見る。 */}
          <span
            className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
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
                      className="size-3 shrink-0 text-primary/60"
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
                      avatarId={member.avatarId}
                      isConnected={
                        presentIds.has(member.userId)
                          ? connectedUserIds?.includes(member.userId)
                          : undefined
                      }
                      color={member.color}
                      size={isCurrent ? 30 : 26}
                      isVotingComplete={result === "done"}
                      completionLabel={t("presented")}
                    />
                    {result === "passed" ? (
                      <span
                        className="absolute -bottom-1 -right-1 inline-flex size-3.5 items-center justify-center rounded-full border border-background bg-muted-foreground text-background"
                        role="img"
                        aria-label={t("passAria")}
                      >
                        <Minus aria-hidden="true" className="size-2.5" />
                      </span>
                    ) : null}
                  </span>
                  {isCurrent ? (
                    <span className="min-w-0 max-w-28 text-left leading-tight">
                      <span className="block text-xs font-bold text-primary-strong">
                        {currentStatusLabel}
                      </span>
                      <span className="block truncate text-xs font-semibold text-foreground">
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
              ? t("sharingComplete")
              : sharing.status === "ready"
                ? t("sharingOneByOne")
                : `${currentStatusLabel}：${current?.name ?? ""}`}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        aria-label={t("turnOrder")}
      >
        <p className="text-base font-semibold">{t("turnOrder")}</p>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          {t("shareInstruction")}
        </p>
        <ol className="max-h-72 space-y-3 overflow-y-auto">
          {sharing.order.map((member, index) => (
            <li
              key={member.userId}
              className="flex items-center gap-2 text-base"
            >
              <MemberSelection
                name={
                  member.userId === currentUserId && onEditSelf
                    ? headerMessages("renameMember", { name: member.name })
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
                    : onSelectMember &&
                        member.userId !== currentUserId &&
                        members.some((entry) => entry.userId === member.userId)
                      ? () => {
                          setOpen(false);
                          onSelectMember(member.userId);
                        }
                      : undefined
                }
              >
                <MemberAvatar
                  name={member.name}
                  avatarId={member.avatarId}
                  isConnected={
                    presentIds.has(member.userId)
                      ? connectedUserIds?.includes(member.userId)
                      : undefined
                  }
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
                </span>
                <span className="shrink-0">
                  {!presentIds.has(member.userId)
                    ? t("left")
                    : sharing.results[index] === "passed"
                      ? t("passed")
                      : sharing.results[index] === "done"
                        ? t("presented")
                        : index === sharing.currentIndex
                          ? t("presenting")
                          : t("upNext")}
                </span>
              </MemberSelection>
              {canPassPresenter && index === sharing.currentIndex ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shrink-0 px-3 text-sm"
                  aria-label={t("passMember", { name: member.name })}
                  disabled={passDisabled}
                  onClick={requestPass}
                >
                  {t("pass")}
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
        {otherMembers.length > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1 text-xs text-muted-foreground">
              {t("otherParticipants")}
            </p>
            {otherMembers.map((member) => (
              <MemberSelection
                key={member.userId}
                name={
                  member.userId === currentUserId && onEditSelf
                    ? headerMessages("renameMember", { name: member.name })
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
                    : onSelectMember && member.userId !== currentUserId
                      ? () => {
                          setOpen(false);
                          onSelectMember(member.userId);
                        }
                      : undefined
                }
              >
                <MemberAvatar
                  name={member.name}
                  avatarId={member.avatarId}
                  isConnected={
                    presentIds.has(member.userId)
                      ? connectedUserIds?.includes(member.userId)
                      : undefined
                  }
                  color={member.color}
                  size={28}
                />
                <span className="min-w-0 break-words text-base">
                  {member.name}
                </span>
              </MemberSelection>
            ))}
          </div>
        ) : null}
      </PopoverContent>
      <AlertDialog
        open={passConfirmOpen}
        onOpenChange={(value) => {
          if (!value) setPassTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("passMemberConfirm", { name: current?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("participantConnected", { name: current?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={passDisabled}
              onClick={() => {
                setPassTarget(null);
                onPassPresenter?.();
              }}
            >
              {t("pass")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );
}

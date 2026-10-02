"use client";

import { useState } from "react";
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
import type { Member } from "../logic/room-reducer";

export type HostTransferDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  currentUserId: string;
  onConfirm: (targetUserId: string) => void;
  pending: boolean;
  disconnected: boolean;
  error: string | null;
};

export function HostTransferDialog({
  open,
  onOpenChange,
  members,
  currentUserId,
  onConfirm,
  pending,
  disconnected,
  error,
}: HostTransferDialogProps) {
  const [targetId, setTargetId] = useState("");
  const candidates = members.filter(
    (member) => member.userId !== currentUserId,
  );
  const target = candidates.find((member) => member.userId === targetId);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ホストを引き継ぎますか？</AlertDialogTitle>
          <AlertDialogDescription>
            開始・進行・解散の操作を相手に引き継ぎます。開始前なら、新しいホストから再び引き継げます。接続中の相手を選んでください。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="grid gap-2 text-sm font-medium">
          引き継ぎ先
          <select
            value={target ? targetId : ""}
            onChange={(event) => setTargetId(event.target.value)}
            disabled={pending || disconnected}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground"
          >
            <option value="">メンバーを選択</option>
            {candidates.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name || "名前未設定"}
              </option>
            ))}
          </select>
        </label>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            ほかのメンバーが参加すると引き継げます。
          </p>
        ) : null}
        {disconnected ? (
          <p role="status" className="text-sm text-muted-foreground">
            再接続してから操作してください。
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            disabled={!target || pending || disconnected}
            onClick={(event) => {
              event.preventDefault();
              if (target) onConfirm(target.userId);
            }}
          >
            {pending
              ? "引き継ぎ中…"
              : target
                ? `${target.name || "名前未設定"}さんに引き継ぐ`
                : "引き継ぐ"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

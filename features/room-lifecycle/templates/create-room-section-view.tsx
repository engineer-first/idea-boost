"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { RoomEntryField } from "../molecules/room-entry-field";

export type CreateRoomSectionViewProps = {
  pending?: boolean;
  onSubmit?: (name: string) => void;
  recovering?: boolean;
  intentName?: string;
  message?: string;
  storageError?: boolean;
  onNewIntent?: () => void;
  onDiscard?: () => void;
  recoveryState?: string;
  requiresNewConfirmation?: boolean;
  onRecover?: () => void;
};

// 選択・通信はcontainer、作成直前の確認と入力はview内の一時的なUI状態。
export function CreateRoomSectionView({
  pending = false,
  onSubmit,
  recovering = false,
  intentName,
  message,
  storageError = false,
  onNewIntent,
  onDiscard,
  recoveryState,
  requiresNewConfirmation = false,
  onRecover,
}: CreateRoomSectionViewProps) {
  const [confirmationName, setConfirmationName] = useState<string | null>(null);
  return (
    <Card
      className="flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md"
      data-testid="home-create-room"
    >
      <CardHeader className="gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Plus className="size-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-base">ルームを作成</CardTitle>
          <CardDescription className="leading-relaxed">
            ホストとして新しいルームを開き、メンバーを招待します。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <form
          className="flex w-full flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(
              new FormData(event.currentTarget).get("name") ?? "",
            );
            if (requiresNewConfirmation) setConfirmationName(name);
            else onSubmit?.(name);
          }}
        >
          <RoomEntryField
            id="room-name"
            label="ルーム名（任意）"
            name="name"
            maxLength={80}
            disabled={pending || recovering || storageError}
            defaultValue={intentName}
            key={intentName ?? "new"}
            placeholder="例：新しいサービスの相談"
          />
          <Button
            type="submit"
            size="lg"
            className="h-11 w-full"
            disabled={pending || storageError}
            data-icon="inline-start"
          >
            <Plus data-icon="inline-start" aria-hidden />
            {pending
              ? "準備中…"
              : recovering
                ? recoveryState === "prepared"
                  ? "作成を続ける"
                  : "もう一度試す"
                : "新しいルームを作成"}
          </Button>
        </form>
        {recovering && !message && (
          <p className="mt-3 text-sm leading-relaxed">
            {recoveryState === "prepared"
              ? "準備したルームの作成を続けられます。"
              : "ルームへの移動が途中で止まっています。もう一度お試しください。"}
          </p>
        )}
        {message && (
          <p role="status" className="mt-3 text-sm leading-relaxed">
            {message}
          </p>
        )}
        {recovering && onNewIntent && (
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            disabled={pending}
            onClick={onNewIntent}
          >
            新しいルームを作成
          </Button>
        )}
        {!recovering && requiresNewConfirmation && onRecover && (
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            disabled={pending}
            onClick={onRecover}
          >
            前のルームを探す
          </Button>
        )}
        {storageError && onDiscard && (
          <Button
            type="button"
            variant="outline"
            className="mt-2 min-h-11"
            onClick={onDiscard}
          >
            このブラウザの保存をリセット
          </Button>
        )}
        {storageError && (
          <Button
            type="button"
            variant="outline"
            className="mt-2 min-h-11"
            onClick={() => window.location.reload()}
          >
            再読み込みする
          </Button>
        )}
        <AlertDialog
          open={confirmationName !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmationName(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>新しいルームを作成しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                前のルームが作成されている場合は、両方のルームが残ります。前のルームの参加状態やデータは変わりません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmationName === null || pending || storageError)
                    return;
                  const name = confirmationName;
                  setConfirmationName(null);
                  onSubmit?.(name);
                }}
              >
                新しいルームを作成する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

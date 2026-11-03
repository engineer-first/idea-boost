"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROOM_CREATION_NAME_MAX } from "@/contracts/room-creation";
import { createRoomCopy } from "../logic/create-room-copy";
import { RoomEntryField } from "../molecules/room-entry-field";

export type CreateRoomSectionViewProps = {
  pending?: boolean;
  onSubmit?: (name: string) => void;
  intentName?: string;
  message?: string;
};

// 入力だけをviewに持ち、作成・再試行はcontainerの同じ操作へ渡す。
export function CreateRoomSectionView({
  pending = false,
  onSubmit,
  intentName,
  message,
}: CreateRoomSectionViewProps) {
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
            {createRoomCopy.description}
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
            onSubmit?.(name);
          }}
        >
          <RoomEntryField
            id="room-name"
            label="ルーム名（任意）"
            name="name"
            maxLength={ROOM_CREATION_NAME_MAX}
            disabled={pending}
            defaultValue={intentName}
            key={intentName ?? "new"}
            placeholder="例：新しいサービスの相談"
          />
          <Button
            type="submit"
            size="lg"
            className="h-11 w-full"
            disabled={pending}
            data-icon="inline-start"
          >
            <Plus data-icon="inline-start" aria-hidden />
            {pending
              ? "準備中…"
              : message
                ? "もう一度試す"
                : "新しいルームを作成"}
          </Button>
        </form>
        {message && (
          <p role="status" className="mt-3 text-sm leading-relaxed">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

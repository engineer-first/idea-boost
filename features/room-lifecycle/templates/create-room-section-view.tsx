"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ROOM_CREATION_NAME_MAX } from "@/contracts/room-creation";
import { createRoomCopy } from "../logic/create-room-copy";
import { RoomEntryField } from "../molecules/room-entry-field";
import styles from "./room-entry-section.module.css";

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
  const [input, setInput] = useState({ intentName, value: intentName ?? "" });
  const draft =
    input.intentName === intentName ? input.value : (intentName ?? "");
  const tooLong = draft.trim().length > ROOM_CREATION_NAME_MAX;
  return (
    <Card className={styles.create} data-testid="home-create-room">
      <CardHeader className={styles.createHeader}>
        <h2>ルームを作成</h2>
        <CardDescription className={styles.description}>
          {createRoomCopy.description}
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.createContent}>
        <form
          className="flex w-full flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(
              new FormData(event.currentTarget).get("name") ?? "",
            );
            if (!tooLong) onSubmit?.(name);
          }}
        >
          <RoomEntryField
            id="room-name"
            label="ルーム名（任意）"
            name="name"
            onChange={(event) =>
              setInput({ intentName, value: event.target.value })
            }
            error={
              tooLong
                ? `ルーム名は${ROOM_CREATION_NAME_MAX}文字以内で入力してください。`
                : undefined
            }
            disabled={pending}
            defaultValue={intentName}
            key={intentName ?? "new"}
            placeholder="例：新しいサービスの相談"
          />
          <Button
            type="submit"
            size="lg"
            className={styles.primaryAction}
            disabled={pending || tooLong}
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
          <p role="status" className="mt-3 text-base leading-relaxed">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

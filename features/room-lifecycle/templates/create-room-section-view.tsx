"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ROOM_CREATION_NAME_MAX } from "@/contracts/room-creation";
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
  const t = useTranslations("app.createRoom");
  const [input, setInput] = useState({ intentName, value: intentName ?? "" });
  const draft =
    input.intentName === intentName ? input.value : (intentName ?? "");
  const tooLong = draft.trim().length > ROOM_CREATION_NAME_MAX;
  return (
    <Card className={styles.create} data-testid="home-create-room">
      <CardHeader className={styles.createHeader}>
        <h2>{t("title")}</h2>
        <CardDescription className={styles.description}>
          {t("description")}
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
            label={t("label")}
            name="name"
            onChange={(event) =>
              setInput({ intentName, value: event.target.value })
            }
            error={
              tooLong
                ? t("tooLong", { max: ROOM_CREATION_NAME_MAX })
                : undefined
            }
            disabled={pending}
            defaultValue={intentName}
            key={intentName ?? "new"}
            placeholder={t("placeholder")}
            description={t("hint")}
          />
          <Button
            type="submit"
            size="lg"
            className={styles.primaryAction}
            disabled={pending || tooLong}
            data-icon="inline-start"
          >
            <Plus data-icon="inline-start" aria-hidden />
            {pending ? t("pending") : message ? t("retry") : t("submit")}
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

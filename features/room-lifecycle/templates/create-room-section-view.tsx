// ホーム「ルームを作成」の表示専用（NoteCard と同様、見た目は props で固定）。
// 副作用（Server Action / 遷移）は CreateRoomSection コンテナ側。

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RoomEntryField } from "../molecules/room-entry-field";

export type CreateRoomSectionViewProps = {
  // true の間は「作成中…」表示とボタン disabled。
  pending?: boolean;
  onSubmit?: (name: string) => void;
  recovering?: boolean;
  intentName?: string;
  message?: string;
  storageError?: boolean;
  onNewIntent?: () => void;
  onDiscard?: () => void;
  recoveryState?: string;
  issuedAt?: number;
  savedIntents?: { requestId: string; name: string; state: string }[];
  onSelectIntent?: (requestId: string) => void;
};

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
  issuedAt,
  savedIntents = [],
  onSelectIntent,
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
            ホストとして新しいセッションを開き、メンバーを招待します。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <form
          className="flex w-full flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.(
              String(new FormData(event.currentTarget).get("name") ?? ""),
            );
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
              ? "作成中…"
              : recovering
                ? recoveryState === "known"
                  ? "作成済みのルームを開く"
                  : "前回の作成を確認"
                : "ルームを作成"}
          </Button>
        </form>
        {recovering && issuedAt !== undefined && issuedAt > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            控えの作成日時: {new Date(issuedAt).toLocaleString("ja-JP")}
          </p>
        )}
        {recovering && !message && (
          <p className="mt-2 text-sm">
            {recoveryState === "known"
              ? "ルームは作成済みです。"
              : recoveryState === "prepared"
                ? "送信前の控えがあります。"
                : "前回の作成結果を確認できます。"}
          </p>
        )}
        {message && (
          <p role="status" className="mt-3 text-sm leading-relaxed">
            {message}
          </p>
        )}
        {recovering && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              別のルームを作成すると、前回のルームが作成済みの場合は両方が残ります。
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onNewIntent}
            >
              別のルームを新しく作成
            </Button>
          </div>
        )}
        {savedIntents.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              このブラウザのほかの控え
            </p>
            {savedIntents.map((saved) => (
              <Button
                key={saved.requestId}
                type="button"
                variant="outline"
                className="h-auto min-h-11 w-full whitespace-normal break-words"
                disabled={pending}
                onClick={() => onSelectIntent?.(saved.requestId)}
              >
                {saved.state === "known" ? "作成済み" : "結果を確認"}:{" "}
                {saved.name || "名前なし"}
              </Button>
            ))}
          </div>
        )}
        {storageError && onDiscard && (
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={onDiscard}
          >
            控えを明示的に破棄
          </Button>
        )}
        {storageError && (
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={() => window.location.reload()}
          >
            再読み込みして控えを確認
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

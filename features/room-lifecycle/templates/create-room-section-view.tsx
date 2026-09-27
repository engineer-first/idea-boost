// ホーム「ルームを作成」の表示専用（NoteCard と同様、見た目は props で固定）。
// 副作用（Server Action / 遷移）は CreateRoomSection コンテナ側。

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type CreateRoomSectionViewProps = {
  // true の間は「作成中…」表示とボタン disabled。
  pending?: boolean;
  onSubmit?: (name: string) => void;
};

export function CreateRoomSectionView({
  pending = false,
  onSubmit,
}: CreateRoomSectionViewProps) {
  return (
    <Card
      className="flex h-full flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md"
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
      <CardFooter>
        <form
          className="w-full space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.(
              String(new FormData(event.currentTarget).get("name") ?? ""),
            );
          }}
        >
          <div className="space-y-2">
            <label htmlFor="room-name" className="text-sm font-medium">
              ルーム名（任意）
            </label>
            <Input
              id="room-name"
              name="name"
              maxLength={80}
              disabled={pending}
              placeholder="例：新しいサービスの相談"
              aria-describedby="room-name-help"
            />
            <p id="room-name-help" className="text-xs text-muted-foreground">
              空欄でも作成できます。個人名は入力しないでください。
            </p>
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={pending}
            data-icon="inline-start"
          >
            <Plus data-icon="inline-start" aria-hidden />
            {pending ? "作成中…" : "ルームを作成"}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}

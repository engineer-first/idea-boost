// ホーム「ルームに参加」セクションの表示専用。
// 招待ページへ進むコード入力と、遷移中・入力エラーを表示する。
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { inviteCopy } from "../logic/invite-copy";
import { RoomEntryField } from "../molecules/room-entry-field";

export type JoinRoomSectionViewProps = {
  code: string;
  canSubmit: boolean;
  onCodeChange: (code: string) => void;
  onCodeBlur?: () => void;
  codeError?: string;
  moving?: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function JoinRoomSectionView({
  code,
  canSubmit,
  onCodeChange,
  onCodeBlur,
  codeError,
  moving = false,
  onSubmit,
}: JoinRoomSectionViewProps) {
  return (
    <Card
      className="flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md"
      data-testid="home-join-room"
    >
      <CardHeader className="gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <LogIn className="size-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-base">ルームに参加</CardTitle>
          <CardDescription className="leading-relaxed">
            ホストから共有された 6 桁の招待コードを入力します。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <form
          onSubmit={onSubmit}
          className="flex w-full flex-col gap-1"
          data-testid="join-room-form"
        >
          <RoomEntryField
            id="code"
            label={inviteCopy.codeLabel}
            name="code"
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            onBlur={onCodeBlur}
            error={codeError}
            placeholder="AB12CD"
            autoComplete="off"
            required
            spellCheck={false}
            className="font-mono text-center tracking-[0.35em] uppercase"
          />
          <Button
            type="submit"
            variant="outline"
            size="lg"
            disabled={!canSubmit || moving}
            className="h-11 w-full"
          >
            {moving ? "移動中…" : "参加する"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ホーム「ルームに参加」セクションの表示専用。
// 招待ページへ進むコード入力と、遷移中・入力エラーを表示する。
import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { RoomEntryField } from "../molecules/room-entry-field";
import styles from "./room-entry-section.module.css";

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
  const t = useTranslations("app.joinRoom");
  return (
    <Card className={styles.join} data-testid="home-join-room">
      <div className={styles.joinLayout}>
        <CardHeader className={styles.joinHeader}>
          <div className={styles.joinIcon}>
            <LogIn className="size-5" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <h2>{t("title")}</h2>
            <CardDescription className={styles.description}>
              {t("description")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className={styles.joinContent}>
          <form
            onSubmit={onSubmit}
            className={styles.joinForm}
            data-testid="join-room-form"
          >
            <RoomEntryField
              id="code"
              label={t("label")}
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
              className={styles.joinAction}
            >
              {moving ? t("moving") : t("submit")}
            </Button>
          </form>
        </CardContent>
      </div>
    </Card>
  );
}

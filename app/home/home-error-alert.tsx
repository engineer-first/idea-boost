// ホーム画面用のエラー表示（molecule）。
// shadcn Alert + lucide アイコンで視線を集めつつ、破壊的すぎない default トーン。
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type HomeErrorAlertProps = {
  message: string;
};

export function HomeErrorAlert({ message }: HomeErrorAlertProps) {
  const t = useTranslations("app.home");
  return (
    <Alert
      data-testid="home-error-alert"
      className="border-destructive/20 bg-destructive/5 "
    >
      <CircleAlert className="text-destructive" aria-hidden />
      <AlertTitle className="text-destructive">
        {t("roomErrorTitle")}
      </AlertTitle>
      <AlertDescription className="text-destructive/90">
        {message}
      </AlertDescription>
    </Alert>
  );
}

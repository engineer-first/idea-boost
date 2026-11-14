import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { HistoryBackButton } from "./history-back-button";
import {
  type RouteStatusKind,
  routeStatusActionCopy,
  routeStatusCopy,
} from "./route-status-copy";

// 404・表示失敗の受け皿。検索から中身のない画面に見えないよう、
// 自動では移動させず、利用者が戻り先を選ぶ（#993）。
export function RouteStatusView({ kind }: { kind: RouteStatusKind }) {
  const { heading, description } = routeStatusCopy[kind];
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col items-center overflow-y-auto p-4 sm:p-6">
      <Card className="my-auto w-full max-w-md shrink-0">
        <CardHeader className="gap-3">
          <h1 className="text-xl font-semibold leading-snug text-balance">
            {heading}
          </h1>
          <CardDescription className="leading-relaxed">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild className="min-h-11">
            {/* global-error は Next のルーターの外でも描くため、通常のリンクで全体を読み直す。 */}
            <a href="/">{routeStatusActionCopy.topLabel}</a>
          </Button>
          <HistoryBackButton label={routeStatusActionCopy.backLabel} />
        </CardContent>
      </Card>
    </main>
  );
}

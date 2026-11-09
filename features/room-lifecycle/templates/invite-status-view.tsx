import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  type InviteStatusKind,
  inviteCopy,
  inviteStatusCopy,
} from "../logic/invite-copy";

export type InviteStatusViewProps =
  | { kind: "unavailable"; retryHref: string }
  | { kind: Exclude<InviteStatusKind, "unavailable"> };

export function InviteStatusView(props: InviteStatusViewProps) {
  const { heading, description } = inviteStatusCopy[props.kind];
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
          {props.kind === "unavailable" && (
            <Button asChild className="min-h-11">
              {/* フルリロードで同じ招待URLをサーバーに再照会する。 */}
              <a href={props.retryHref}>{inviteCopy.retryLabel}</a>
            </Button>
          )}
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/home">{inviteCopy.homeLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

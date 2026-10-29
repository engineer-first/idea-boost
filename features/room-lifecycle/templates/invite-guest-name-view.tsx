import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { inviteCopy, inviteGuestNameCopy } from "../logic/invite-copy";

export type InviteGuestNameViewProps = {
  inviteCode: string;
  children: ReactNode;
};

export function InviteGuestNameView({
  inviteCode,
  children,
}: InviteGuestNameViewProps) {
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col items-center overflow-y-auto p-4 sm:p-6">
      <Card className="my-auto w-full max-w-md shrink-0">
        <CardHeader className="gap-3">
          <h1 className="text-xl font-semibold leading-snug text-balance">
            {inviteGuestNameCopy.heading}
          </h1>
          <CardDescription className="leading-relaxed">
            {inviteGuestNameCopy.description}
          </CardDescription>
          <p className="text-sm text-muted-foreground">
            {inviteCopy.codeLabel}{" "}
            <span className="font-mono text-foreground">{inviteCode}</span>
          </p>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}

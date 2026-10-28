"use client";

import { Button } from "@/components/ui/button";
import type { AccountLinkResult } from "@/contracts/account-link";
import {
  accountLinkButtonLabel,
  accountLinkedNotice,
  accountLinkGuestNotice,
  getAccountLinkResultMessage,
} from "../logic/account-link-copy";

export type AccountLinkSectionViewProps = {
  status: "guest" | "linked";
  result?: AccountLinkResult;
  pending?: boolean;
  action: () => void | Promise<void>;
};

export function AccountLinkSectionView({
  status,
  result,
  pending = false,
  action,
}: AccountLinkSectionViewProps) {
  return (
    <section aria-label="Googleとの連携" className="grid gap-2 text-sm">
      {status === "guest" ? (
        <>
          <form action={action}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={pending}
              className="h-auto max-w-full whitespace-normal py-2 text-left"
            >
              {accountLinkButtonLabel}
            </Button>
          </form>
          <p className="text-muted-foreground">{accountLinkGuestNotice}</p>
        </>
      ) : result !== "linked" ? (
        <p className="text-muted-foreground">{accountLinkedNotice}</p>
      ) : null}
      {result ? (
        <p role="status">{getAccountLinkResultMessage(result)}</p>
      ) : null}
    </section>
  );
}

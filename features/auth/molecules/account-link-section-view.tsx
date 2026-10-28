import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import type { AccountLinkResult } from "@/contracts/account-link";
import {
  accountLinkButtonLabel,
  accountLinkedNotice,
  accountLinkGuestNotice,
  accountLinkPendingLabel,
  getAccountLinkResultMessage,
} from "../logic/account-link-copy";

export type AccountLinkSectionViewProps = {
  status: "guest" | "linked";
  result?: AccountLinkResult;
  resultRef?: Ref<HTMLParagraphElement>;
  pending?: boolean;
  action: () => void | Promise<void>;
};

export function AccountLinkSectionView({
  status,
  result,
  resultRef,
  pending = false,
  action,
}: AccountLinkSectionViewProps) {
  return (
    <section aria-label="Googleとの連携" className="grid gap-2 text-sm">
      {result === "already_linked" ? null : status === "guest" ? (
        <>
          <form action={action}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={pending}
              className="h-auto max-w-full whitespace-normal py-2 text-left"
            >
              {pending ? accountLinkPendingLabel : accountLinkButtonLabel}
            </Button>
          </form>
          <p className="text-muted-foreground">{accountLinkGuestNotice}</p>
        </>
      ) : result !== "linked" ? (
        <p className="text-muted-foreground">{accountLinkedNotice}</p>
      ) : null}
      {result ? (
        <p ref={resultRef} role="status" tabIndex={-1}>
          {getAccountLinkResultMessage(result)}
        </p>
      ) : null}
    </section>
  );
}

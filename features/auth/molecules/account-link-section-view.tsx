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
  layout?: "section" | "inline";
  result?: AccountLinkResult;
  resultRef?: Ref<HTMLParagraphElement>;
  pending?: boolean;
  action: () => void | Promise<void>;
};

export function AccountLinkSectionView({
  status,
  layout = "section",
  result,
  resultRef,
  pending = false,
  action,
}: AccountLinkSectionViewProps) {
  if (layout === "inline") {
    return (
      <section
        aria-label="Googleとの連携"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
      >
        {result === "already_linked" ? null : status === "guest" ? (
          <>
            <span className="text-muted-foreground">
              別の端末でも見返すなら
            </span>
            <form action={action}>
              <Button
                type="submit"
                variant="link"
                size="sm"
                disabled={pending}
                className="h-auto min-h-10 px-1 py-1 text-sm"
              >
                {pending ? accountLinkPendingLabel : "Googleと連携"}
              </Button>
            </form>
          </>
        ) : result !== "linked" ? (
          <p className="text-muted-foreground">{accountLinkedNotice}</p>
        ) : null}

        {result ? (
          <p
            ref={resultRef}
            role="status"
            tabIndex={-1}
            className="w-full text-sm text-muted-foreground focus:outline-none"
          >
            {getAccountLinkResultMessage(result)}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-label="Googleとの連携" className="grid gap-2 text-base">
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
        <p
          ref={resultRef}
          role="status"
          tabIndex={-1}
          className="focus:outline-none"
        >
          {getAccountLinkResultMessage(result)}
        </p>
      ) : null}
    </section>
  );
}

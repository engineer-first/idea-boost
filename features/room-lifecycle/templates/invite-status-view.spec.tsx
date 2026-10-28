import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  type InviteStatusKind,
  inviteCopy,
  inviteStatusCopy,
} from "../logic/invite-copy";
import { InviteStatusView } from "./invite-status-view";

const kinds: InviteStatusKind[] = [
  "invalid",
  "not_found",
  "ended",
  "unavailable",
];
describe("InviteStatusView", () => {
  it.each(kinds)(
    "%s はホームリンクを表示し、再試行リンクは unavailable だけに表示する",
    (kind) => {
      const props =
        kind === "unavailable"
          ? ({ kind, retryHref: "/invite/ABC234" } as const)
          : { kind };
      render(<InviteStatusView {...props} />);
      expect(
        screen.getByRole("heading", { name: inviteStatusCopy[kind].heading }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: inviteCopy.homeLabel }),
      ).toHaveAttribute("href", "/home");
      const retry = screen.queryByRole("link", { name: inviteCopy.retryLabel });
      if (kind === "unavailable") {
        expect(retry).toHaveAttribute("href", "/invite/ABC234");
      } else {
        expect(retry).not.toBeInTheDocument();
      }
    },
  );
});

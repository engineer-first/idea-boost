import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildSharingState } from "@/contracts/room-protocol.fixture";
import { SharingAnnouncement } from "./sharing-announcement";

const [first, second] = buildSharingState().order;

describe("SharingAnnouncement の「パスする」を押した後のフォーカス", () => {
  it.each([
    {
      label: "番が次の人へ移りボタンが消えた",
      after: { member: second, isDisconnected: false },
    },
    {
      label: "送信中でボタンが押せなくなった",
      after: { member: first, isDisconnected: true, passDisabled: true },
    },
  ])("$label とき、中央の表示へフォーカスを移す", ({ after }) => {
    const onPass = () => {};
    const { rerender } = render(
      <TooltipProvider>
        <SharingAnnouncement member={first} isDisconnected onPass={onPass} />
      </TooltipProvider>,
    );
    const pass = screen.getByRole("button", { name: /をパス/ });
    pass.focus();
    fireEvent.click(pass);

    rerender(
      <TooltipProvider>
        <SharingAnnouncement {...after} onPass={onPass} />
      </TooltipProvider>,
    );

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(
      screen.getByTestId("sharing-current-presenter"),
    );
  });

  it("パスを押していない人のフォーカスは、番が移っても動かさない", () => {
    const { rerender } = render(
      <TooltipProvider>
        <button type="button">ほかの操作</button>
        <SharingAnnouncement member={first} isDisconnected onPass={() => {}} />
      </TooltipProvider>,
    );
    const other = screen.getByRole("button", { name: "ほかの操作" });
    other.focus();

    rerender(
      <TooltipProvider>
        <button type="button">ほかの操作</button>
        <SharingAnnouncement member={second} onPass={() => {}} />
      </TooltipProvider>,
    );

    expect(document.activeElement).toBe(other);
  });
});

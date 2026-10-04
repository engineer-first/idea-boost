import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostTransferDialog } from "./host-transfer-dialog";

describe("ホスト変更確認のEscape", () => {
  it.each([
    false,
    true,
  ])("閉じかけの参加者一覧が処理済みのEscapeも確認画面が扱う pending=%s", (pending) => {
    const onOpenChange = vi.fn();
    render(
      <HostTransferDialog
        open
        target={{
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Hana Sato",
          color: "blue",
        }}
        pending={pending}
        disconnected={false}
        error={null}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
      />,
    );
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    fireEvent(screen.getByRole("alertdialog"), event);
    if (pending) expect(onOpenChange).not.toHaveBeenCalled();
    else expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});

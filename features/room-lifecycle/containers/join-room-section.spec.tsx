import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { JoinRoomSection } from "./join-room-section";

beforeEach(() => push.mockReset());

describe("JoinRoomSection", () => {
  it.each(["ABC234", " abc234 "])(
    "有効コード %s の送信は正規化した招待ページへ移動する",
    async (code) => {
      render(<JoinRoomSection />);
      fireEvent.change(screen.getByRole("textbox", { name: "招待コード" }), {
        target: { value: code },
      });
      fireEvent.submit(screen.getByTestId("join-room-form"));
      await waitFor(() =>
        expect(push).toHaveBeenCalledExactlyOnceWith("/invite/ABC234"),
      );
    },
  );

  it.each(["", "AB", "AB!2CD"])(
    "無効コード %s の送信では移動しない",
    (code) => {
      render(<JoinRoomSection />);
      fireEvent.change(screen.getByRole("textbox", { name: "招待コード" }), {
        target: { value: code },
      });
      fireEvent.submit(screen.getByTestId("join-room-form"));
      expect(push).not.toHaveBeenCalled();
    },
  );
});

it("本人確認不可ではActionの説明を通知しGoogle再認証へ進まない", async () => {
  PUSH.mockClear();
  notifyMocks.error.mockClear();
  const user = userEvent.setup();
  await openConfirmDialog(user);
  const error =
    "このブラウザでは、以前の参加者として確認できませんでした。新しく始めると別の参加者になり、以前のホスト権限・付箋・投票は引き継がれません。";
  JOIN_ROOM.mockResolvedValueOnce({
    ok: false,
    reason: "identity_unavailable",
    error,
  });
  await user.click(screen.getByTestId("join-confirm-action"));
  await waitFor(() => expect(notifyMocks.error).toHaveBeenCalledWith(error));
  expect(
    screen.queryByRole("button", { name: "Googleでログインして続ける" }),
  ).not.toBeInTheDocument();
  expect(PUSH).not.toHaveBeenCalled();
});

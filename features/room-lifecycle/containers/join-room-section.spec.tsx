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

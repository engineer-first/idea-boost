import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PUSH = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: PUSH }),
}));

const CREATE_ROOM = vi.fn();
vi.mock("../logic/actions", () => ({
  createRoom: (...args: unknown[]) => CREATE_ROOM(...args),
}));

const notifyMocks = vi.hoisted(() => ({
  roomCreated: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({
  notify: { error: notifyMocks.error },
}));
vi.mock("../logic/lifecycle-notify", () => ({
  lifecycleNotify: { roomCreated: notifyMocks.roomCreated },
}));

import { CreateRoomSection } from "./create-room-section";

describe("CreateRoomSection", () => {
  beforeEach(() => {
    PUSH.mockReset();
    CREATE_ROOM.mockReset();
    notifyMocks.roomCreated.mockReset();
    notifyMocks.error.mockReset();
  });

  it("「ルームを作成」ボタンを描画する", () => {
    render(<CreateRoomSection />);
    expect(
      screen.getByRole("button", { name: "ルームを作成" }),
    ).toBeInTheDocument();
  });

  it("作成成功時は toast して start へ遷移する", async () => {
    const user = userEvent.setup();
    CREATE_ROOM.mockResolvedValueOnce({
      ok: true,
      roomId: "123e4567-e89b-42d3-a456-426614174000",
    });
    render(<CreateRoomSection />);
    await user.click(screen.getByRole("button", { name: "ルームを作成" }));
    await waitFor(() => {
      expect(notifyMocks.roomCreated).toHaveBeenCalledTimes(1);
      expect(PUSH).toHaveBeenCalledWith(
        "/rooms/123e4567-e89b-42d3-a456-426614174000/start",
      );
    });
  });

  it("任意のルーム名を作成処理へ渡す", async () => {
    const user = userEvent.setup();
    CREATE_ROOM.mockResolvedValueOnce({ ok: true, roomId: "room" });
    render(<CreateRoomSection />);
    await user.type(
      screen.getByRole("textbox", { name: "ルーム名（任意）" }),
      "新しいサービスの相談",
    );
    await user.click(screen.getByRole("button", { name: "ルームを作成" }));
    await waitFor(() =>
      expect(CREATE_ROOM).toHaveBeenCalledWith("新しいサービスの相談"),
    );
  });

  it("作成失敗時は error toast を出し遷移しない", async () => {
    const user = userEvent.setup();
    CREATE_ROOM.mockResolvedValueOnce({
      ok: false,
      error: "ルームを作成できませんでした。",
    });
    render(<CreateRoomSection />);
    await user.click(screen.getByRole("button", { name: "ルームを作成" }));
    await waitFor(() => {
      expect(notifyMocks.error).toHaveBeenCalledWith(
        "ルームを作成できませんでした。",
      );
    });
    expect(PUSH).not.toHaveBeenCalled();
    expect(notifyMocks.roomCreated).not.toHaveBeenCalled();
  });
});

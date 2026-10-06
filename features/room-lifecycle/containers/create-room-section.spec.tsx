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
  returnToRoom: async (roomId: string) => ({
    kind: "ready",
    href: `/rooms/${roomId}/start`,
  }),
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

import { readLastRoom } from "@/lib/room-client/last-room-storage";
import { saveRoomCreationIntent } from "../logic/room-creation-storage";
import { CreateRoomSection } from "./create-room-section";

describe("CreateRoomSection", () => {
  beforeEach(() => {
    sessionStorage.clear();
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
    render(
      <CreateRoomSection currentUserId="11111111-1111-4111-8111-111111111111" />,
    );
    await user.click(screen.getByRole("button", { name: "ルームを作成" }));
    await waitFor(() => {
      expect(readLastRoom("11111111-1111-4111-8111-111111111111")).toBe(
        "123e4567-e89b-42d3-a456-426614174000",
      );
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
      expect(CREATE_ROOM).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "新しいサービスの相談",
          requestId: expect.any(String),
        }),
      ),
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
  it("応答喪失後の再試行は同じ要求IDを使う", async () => {
    const user = userEvent.setup();
    CREATE_ROOM.mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce({
      ok: true,
      roomId: "room",
    });
    render(
      <CreateRoomSection currentUserId="11111111-1111-4111-8111-111111111111" />,
    );
    await user.click(screen.getByRole("button", { name: "ルームを作成" }));
    await user.click(
      await screen.findByRole("button", { name: "同じ作成を確認・再試行" }),
    );
    await waitFor(() => expect(CREATE_ROOM).toHaveBeenCalledTimes(2));
    expect(CREATE_ROOM.mock.calls[1]).toEqual(CREATE_ROOM.mock.calls[0]);
    expect(CREATE_ROOM.mock.calls[0][0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("再読み込みした作成要求を復元して入力を固定し同IDを送る", async () => {
    const user = userEvent.setup();
    const userId = "11111111-1111-4111-8111-111111111111";
    const saved = {
      requestId: "22222222-2222-4222-8222-222222222222",
      name: "saved",
    };
    saveRoomCreationIntent(userId, saved);
    CREATE_ROOM.mockResolvedValue({
      ok: false,
      outcome: "unknown",
      error: "unknown",
    });
    render(<CreateRoomSection currentUserId={userId} />);
    const input = screen.getByRole("textbox", { name: "ルーム名（任意）" });
    expect(input).toHaveValue("saved");
    expect(input).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "同じ作成を確認・再試行" }),
    );
    await waitFor(() => expect(CREATE_ROOM).toHaveBeenCalledWith(saved));
  });

  it("拒否後もIDを維持し、明示的な別作成だけ新IDを使う", async () => {
    const user = userEvent.setup();
    CREATE_ROOM.mockResolvedValue({
      ok: false,
      outcome: "rejected",
      error: "removed",
    });
    render(<CreateRoomSection />);
    await user.click(screen.getByRole("button", { name: "ルームを作成" }));
    await user.click(
      await screen.findByRole("button", { name: "同じ作成を確認・再試行" }),
    );
    await waitFor(() => expect(CREATE_ROOM).toHaveBeenCalledTimes(2));
    expect(CREATE_ROOM.mock.calls[1]).toEqual(CREATE_ROOM.mock.calls[0]);
    await user.click(
      screen.getByRole("button", { name: "別のルームを新しく作成" }),
    );
    await user.click(screen.getByRole("button", { name: "ルームを作成" }));
    await waitFor(() => expect(CREATE_ROOM).toHaveBeenCalledTimes(3));
    expect(CREATE_ROOM.mock.calls[2][0].requestId).not.toBe(
      CREATE_ROOM.mock.calls[0][0].requestId,
    );
  });

  it("保存失敗時にはAPIへ送らず保存設定の確認を案内する", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("denied");
      });
    render(
      <CreateRoomSection currentUserId="11111111-1111-4111-8111-111111111111" />,
    );
    await user.click(screen.getByRole("button", { name: "ルームを作成" }));
    expect(CREATE_ROOM).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("保存できません");
    spy.mockRestore();
  });
});

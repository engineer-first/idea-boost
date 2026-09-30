// JoinRoomSection（ホーム「ルームに参加」セクション）の単体テスト。
// 招待コードを入力 → lookup でホスト名解決 → 確認 Dialog → joinRoom → toast / 遷移。
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PUSH = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: PUSH }),
}));

const JOIN_ROOM = vi.fn();
const LOOKUP_INVITE = vi.fn();
vi.mock("../logic/actions", () => ({
  joinRoom: (...args: unknown[]) => JOIN_ROOM(...args),
  lookupInviteRoom: (...args: unknown[]) => LOOKUP_INVITE(...args),
}));

const notifyMocks = vi.hoisted(() => ({
  joinedAsGuest: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({
  notify: { error: notifyMocks.error },
}));
vi.mock("../logic/lifecycle-notify", () => ({
  lifecycleNotify: { joinedAsGuest: notifyMocks.joinedAsGuest },
}));

import { JoinRoomSection } from "./join-room-section";

async function openConfirmDialog(user: ReturnType<typeof userEvent.setup>) {
  LOOKUP_INVITE.mockResolvedValueOnce({
    ok: true,
    hostName: "田中太郎",
    inviteCode: "AB12CD",
  });
  render(<JoinRoomSection />);
  await user.type(screen.getByLabelText("招待コード"), "AB12CD");
  await user.click(screen.getByRole("button", { name: "参加する" }));
  await waitFor(() => {
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
}

describe("JoinRoomSection", () => {
  beforeEach(() => {
    PUSH.mockReset();
    JOIN_ROOM.mockReset();
    LOOKUP_INVITE.mockReset();
    notifyMocks.joinedAsGuest.mockReset();
    notifyMocks.error.mockReset();
  });

  it("「ルームに参加」見出しと招待コード入力フォームを描画する", () => {
    render(<JoinRoomSection />);
    expect(screen.getByTestId("home-join-room")).toHaveTextContent(
      "ルームに参加",
    );
    expect(screen.getByLabelText("招待コード")).toBeInTheDocument();
    expect(screen.getByTestId("join-room-form")).toBeInTheDocument();
  });

  it("6 桁英数字以外は「参加する」ボタンが disabled", () => {
    render(<JoinRoomSection />);
    const button = screen.getByRole("button", { name: "参加する" });
    expect(button).toBeDisabled();
  });

  it("6 桁英数字を入れると「参加する」ボタンが enabled", async () => {
    const user = userEvent.setup();
    render(<JoinRoomSection />);
    const input = screen.getByLabelText("招待コード") as HTMLInputElement;
    await user.type(input, "AB12CD");
    expect(input.value).toBe("AB12CD");
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "参加する" }),
      ).not.toBeDisabled();
    });
  });

  it("「参加する」クリックで lookup 後にホスト名付き Dialog が開く", async () => {
    const user = userEvent.setup();
    await openConfirmDialog(user);
    expect(
      screen.getByText("田中太郎 さんが作成したルームに参加しますか？"),
    ).toBeInTheDocument();
    expect(screen.getByText("AB12CD")).toBeInTheDocument();
    expect(LOOKUP_INVITE).toHaveBeenCalledWith("AB12CD");
  });

  it("lookup 失敗時は error toast を出し Dialog を開かない", async () => {
    const user = userEvent.setup();
    LOOKUP_INVITE.mockResolvedValueOnce({
      ok: false,
      error:
        "この招待で参加できるルームを確認できませんでした。招待コードを確認し、招待した人に現在使える招待を確認してください。",
    });
    render(<JoinRoomSection />);
    await user.type(screen.getByLabelText("招待コード"), "AB12CD");
    await user.click(screen.getByRole("button", { name: "参加する" }));
    await waitFor(() => {
      expect(notifyMocks.error).toHaveBeenCalledWith(
        "この招待で参加できるルームを確認できませんでした。招待コードを確認し、招待した人に現在使える招待を確認してください。",
      );
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(JOIN_ROOM).not.toHaveBeenCalled();
    expect(screen.getByLabelText("招待コード")).toHaveValue("AB12CD");
    expect(screen.getByRole("button", { name: "参加する" })).toBeEnabled();
  });

  it("Dialog の「参加する」確定で toast して start へ遷移する", async () => {
    const user = userEvent.setup();
    await openConfirmDialog(user);
    JOIN_ROOM.mockResolvedValueOnce({
      ok: true,
      roomId: "123e4567-e89b-42d3-a456-426614174000",
    });
    await user.click(screen.getByTestId("join-confirm-action"));
    await waitFor(() => {
      expect(notifyMocks.joinedAsGuest).toHaveBeenCalledTimes(1);
      expect(PUSH).toHaveBeenCalledWith(
        "/rooms/123e4567-e89b-42d3-a456-426614174000/start",
      );
    });
    const formData = JOIN_ROOM.mock.calls[0]?.[0] as FormData | undefined;
    expect(formData?.get("code")).toBe("AB12CD");
  });

  it("確認後の終了を表示し、入力を保持して別コードへ戻れる", async () => {
    const user = userEvent.setup();
    await openConfirmDialog(user);
    JOIN_ROOM.mockResolvedValueOnce({
      ok: false,
      error: "終了したルームには参加できません。",
    });
    await user.click(screen.getByTestId("join-confirm-action"));
    await waitFor(() => {
      expect(notifyMocks.error).toHaveBeenCalledWith(
        "終了したルームには参加できません。",
      );
    });
    expect(PUSH).not.toHaveBeenCalled();
    expect(notifyMocks.joinedAsGuest).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    const input = screen.getByLabelText("招待コード");
    expect(input).toHaveValue("AB12CD");
    await user.clear(input);
    await user.type(input, "CD34EF");
    expect(input).toHaveValue("CD34EF");
  });

  it("Dialog の「キャンセル」で Dialog が閉じる", async () => {
    const user = userEvent.setup();
    await openConfirmDialog(user);
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(JOIN_ROOM).not.toHaveBeenCalled();
  });
});

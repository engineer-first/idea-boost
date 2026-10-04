import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readLastRoom,
  rememberLastRoom,
} from "@/lib/room-client/last-room-storage";

const mocks = vi.hoisted(() => ({ push: vi.fn(), confirm: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../logic/actions", () => ({ returnToRoom: mocks.confirm }));

import { ReturnRoomSection } from "./return-room-section";

const userId = "11111111-1111-4111-8111-111111111111";
const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeEach(() => {
  localStorage.clear();
  mocks.push.mockReset();
  mocks.confirm.mockReset();
});
describe("ホームのルーム復帰", () => {
  it("候補なしと別アカウントでは入口を出さない", () => {
    const { rerender } = render(<ReturnRoomSection currentUserId={userId} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rememberLastRoom("22222222-2222-4222-8222-222222222222", roomId);
    rerender(<ReturnRoomSection currentUserId={userId} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("確認中は二重操作を防ぎ、認可された先へ移る", async () => {
    rememberLastRoom(userId, roomId);
    let resolve!: (value: unknown) => void;
    mocks.confirm.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<ReturnRoomSection currentUserId={userId} />);
    const button = screen.getByRole("button", { name: "元のルームに戻る" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    resolve({ kind: "ready", href: `/rooms/${roomId}/start` });
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/rooms/${roomId}/start`),
    );
  });
  it("一時障害では候補を残して再確認し、拒否時には戻れない理由を示す", async () => {
    rememberLastRoom(userId, roomId);
    mocks.confirm
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ kind: "unavailable_room" });
    render(<ReturnRoomSection currentUserId={userId} />);
    fireEvent.click(screen.getByRole("button", { name: "元のルームに戻る" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("確認できません"),
    );
    expect(readLastRoom(userId)).toBe(roomId);
    fireEvent.click(screen.getByRole("button", { name: "もう一度確認する" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("戻れません"),
    );
    expect(readLastRoom(userId)).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("別アカウントへの切替後とunmount後に古い結果で遷移しない", async () => {
    rememberLastRoom(userId, roomId);
    let resolve!: (value: unknown) => void;
    mocks.confirm.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { rerender, unmount } = render(
      <ReturnRoomSection currentUserId={userId} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "元のルームに戻る" }));
    rerender(
      <ReturnRoomSection currentUserId="22222222-2222-4222-8222-222222222222" />,
    );
    unmount();
    resolve({ kind: "ready", href: `/rooms/${roomId}` });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

it("無関係なstorage変更中も確認ボタンは無効で二重送信しない", () => {
  rememberLastRoom(userId, roomId);
  mocks.confirm.mockImplementation(() => new Promise(() => {}));
  render(<ReturnRoomSection currentUserId={userId} />);
  fireEvent.click(screen.getByRole("button", { name: "元のルームに戻る" }));
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "unrelated-key", newValue: "value" }),
    ),
  );
  const button = screen.getByRole("button", { name: "確認中…" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
});

it("確認中に候補が変わったら古い結果を使わない", async () => {
  rememberLastRoom(userId, roomId);
  let resolve!: (value: unknown) => void;
  mocks.confirm.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<ReturnRoomSection currentUserId={userId} />);
  fireEvent.click(screen.getByRole("button", { name: "元のルームに戻る" }));
  act(() => {
    rememberLastRoom(userId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "idea-boost:last-room" }),
    );
  });
  await act(async () => resolve({ kind: "ready", href: `/rooms/${roomId}` }));
  expect(mocks.push).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "元のルームに戻る" }),
  ).toBeEnabled();
});

it("戻れない理由は無関係な保存変更でも消えない", async () => {
  rememberLastRoom(userId, roomId);
  mocks.confirm.mockResolvedValueOnce({ kind: "unavailable_room" });
  render(<ReturnRoomSection currentUserId={userId} />);
  fireEvent.click(screen.getByRole("button", { name: "元のルームに戻る" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("戻れません"),
  );
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "unrelated-key", newValue: "value" }),
    ),
  );
  expect(screen.getByRole("status")).toHaveTextContent("戻れません");
});

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  readLastRoom,
  rememberLastRoom,
} from "@/lib/room-client/last-room-storage";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  confirm: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  query: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../logic/actions", () => ({
  returnToRoom: mocks.confirm,
  queryRoomCreation: mocks.query,
}));
vi.mock("../logic/room-creation-storage", () => ({
  listRoomCreationIntents: mocks.list,
  readRoomCreationIntent: mocks.read,
  saveRoomCreationResult: mocks.receipt,
  subscribeRoomCreations: () => () => {},
  notifyRoomCreations: vi.fn(),
}));

import { ReturnRoomSection } from "./return-room-section";

const userId = "11111111-1111-4111-8111-111111111111";
const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherRoom = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  mocks.list.mockResolvedValue([]);
  mocks.read.mockResolvedValue(null);
  mocks.confirm.mockResolvedValue({
    kind: "ready",
    href: `/rooms/${roomId}/start`,
  });
});
it("候補なしと別アカウントでは入口を出さない", async () => {
  rememberLastRoom("22222222-2222-4222-8222-222222222222", roomId);
  render(<ReturnRoomSection currentUserId={userId} />);
  await act(async () => {});
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("ホーム表示時に完了状態を取得し、移動せず成果へのサブ導線を表示する", async () => {
  rememberLastRoom(userId, roomId);
  mocks.confirm.mockResolvedValue({
    kind: "ready",
    href: `/completed-rooms/${roomId}`,
  });
  render(<ReturnRoomSection currentUserId={userId} />);
  const button = await screen.findByRole("button", {
    name: "前回の成果を見る",
  });
  expect(mocks.confirm).toHaveBeenCalledWith(roomId);
  expect(mocks.push).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(`/completed-rooms/${roomId}`),
  );
  expect(mocks.confirm).toHaveBeenCalledTimes(2);
});
it("初期確認とクリック時の再確認中は二重操作しない", async () => {
  rememberLastRoom(userId, roomId);
  let resolve!: (value: unknown) => void;
  mocks.confirm.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<ReturnRoomSection currentUserId={userId} />);
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "確認中…" }));
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  await act(async () =>
    resolve({ kind: "ready", href: `/rooms/${roomId}/start` }),
  );
  const button = screen.getByRole("button", { name: "前のルームに戻る" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mocks.confirm).toHaveBeenCalledTimes(2);
  await act(async () =>
    resolve({ kind: "ready", href: `/rooms/${roomId}/start` }),
  );
  expect(mocks.push).toHaveBeenCalledTimes(1);
});
it("初期確認の一時障害は候補を保ち、再確認で拒否なら理由を表示する", async () => {
  rememberLastRoom(userId, roomId);
  mocks.confirm
    .mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValueOnce({ kind: "unavailable_room" });
  render(<ReturnRoomSection currentUserId={userId} />);
  const button = await screen.findByRole("button", {
    name: "もう一度確認する",
  });
  expect(readLastRoom(userId)).toBe(roomId);
  fireEvent.click(button);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("戻れません"),
  );
  expect(readLastRoom(userId)).toBeNull();
  expect(mocks.push).not.toHaveBeenCalled();
});
it("利用者切替とunmount後は古い結果を表示・遷移しない", async () => {
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
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
  rerender(
    <ReturnRoomSection currentUserId="22222222-2222-4222-8222-222222222222" />,
  );
  unmount();
  await act(async () => resolve({ kind: "ready", href: `/rooms/${roomId}` }));
  expect(mocks.push).not.toHaveBeenCalled();
});
it("無関係なstorage変更では確認を二重送信せず理由も消さない", async () => {
  rememberLastRoom(userId, roomId);
  let resolve!: (value: unknown) => void;
  mocks.confirm.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<ReturnRoomSection currentUserId={userId} />);
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
  act(() =>
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated-key" })),
  );
  expect(screen.getByRole("button", { name: "確認中…" })).toBeDisabled();
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ kind: "unavailable_room" }));
  act(() =>
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated-key" })),
  );
  expect(screen.getByRole("status")).toHaveTextContent("戻れません");
});
it("確認中に候補が変わったら古い完了状態も遷移も反映しない", async () => {
  rememberLastRoom(userId, roomId);
  let release!: (value: unknown) => void;
  mocks.confirm
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    )
    .mockResolvedValue({ kind: "ready", href: `/rooms/${otherRoom}` });
  render(<ReturnRoomSection currentUserId={userId} />);
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
  act(() => {
    rememberLastRoom(userId, otherRoom);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "idea-boost:last-room" }),
    );
  });
  await screen.findByRole("button", { name: "前のルームに戻る" });
  await act(async () =>
    release({ kind: "ready", href: `/completed-rooms/${roomId}` }),
  );
  expect(
    screen.queryByRole("button", { name: "前回の成果を見る" }),
  ).not.toBeInTheDocument();
  expect(mocks.push).not.toHaveBeenCalled();
});
it("古い作成情報より直前に参加したルームを優先し、以前のルームは別候補にする", async () => {
  rememberLastRoom(userId, roomId);
  mocks.list.mockResolvedValue([
    {
      expectedPrincipal: userId,
      requestId: "request",
      roomId: otherRoom,
      state: "known",
      issuedAt: 1,
      name: "",
    },
  ]);
  render(<ReturnRoomSection currentUserId={userId} />);
  await screen.findByRole("button", { name: "前のルームに戻る" });
  expect(mocks.confirm).toHaveBeenCalledWith(roomId);
  expect(mocks.confirm).not.toHaveBeenCalledWith(otherRoom);
  fireEvent.click(screen.getByText("以前のルーム"));
  fireEvent.click(screen.getByRole("button", { name: /以前のルームを開く/ }));
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith(otherRoom));
});
it("以前の未確定ルームを探す操作は本人の読み取りだけで新規作成しない", async () => {
  mocks.list.mockResolvedValue([
    {
      expectedPrincipal: userId,
      requestId: "request",
      state: "expired",
      issuedAt: 1,
      name: "",
    },
  ]);
  mocks.query.mockResolvedValue({
    ok: true,
    status: { kind: "unknown", acceptance: "expired" },
  });
  render(<ReturnRoomSection currentUserId={userId} />);
  await screen.findByText("以前のルーム");
  fireEvent.click(screen.getByText("以前のルーム"));
  fireEvent.click(screen.getByRole("button", { name: /以前のルームを探す/ }));
  await waitFor(() =>
    expect(mocks.query).toHaveBeenCalledWith(userId, "request"),
  );
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("確認できません");
});

it("以前のルームへの移動失敗は同じ候補を残し、再試行できる理由を表示する", async () => {
  mocks.list.mockResolvedValue([
    {
      expectedPrincipal: userId,
      requestId: "request",
      roomId: roomId,
      state: "known",
      issuedAt: 1,
      name: "",
    },
  ]);
  mocks.push.mockImplementation(() => {
    throw new Error("navigation failed");
  });
  render(<ReturnRoomSection currentUserId={userId} />);
  await screen.findByText("以前のルーム");
  fireEvent.click(screen.getByText("以前のルーム"));
  fireEvent.click(screen.getByRole("button", { name: /以前のルームを開く/ }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("もう一度"),
  );
  expect(
    screen.getByRole("button", { name: /以前のルームを開く/ }),
  ).toBeEnabled();
});

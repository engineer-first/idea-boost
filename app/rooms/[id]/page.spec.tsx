import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  enabled: vi.fn(),
  enough: vi.fn(),
}));
vi.mock("@/features/verification", () => ({
  isVerificationEnabled: mocks.enabled,
  VerificationFollower: () => <span data-testid="follower" />,
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: async () => ({ sub: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("@/features/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/session/room-entry", () => ({
  hasRoomEntryTime: mocks.enough,
  issueRoomEntry: vi.fn().mockResolvedValue("admission"),
}));
vi.mock("@/features/room-lifecycle", () => ({
  RoomAdmissionGate: () => <span>入室前の認証確認</span>,
}));
vi.mock("@/features/room", () => ({
  RoomEntryPreview: () => <span>ルームの背景</span>,
  RoomBoard: () => <span>通常のボード</span>,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));

import RoomPage from "./page";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeEach(() => {
  mocks.api.mockClear();
  mocks.enough.mockReturnValue(true);
  mocks.enabled.mockReturnValue(true);
  mocks.api.mockImplementation(async (path: string) =>
    path.startsWith("/api/completed-rooms/")
      ? Response.json({ error: "not found" }, { status: 404 })
      : Response.json(
          path.endsWith("/members")
            ? { members: [] }
            : {
                roomId: id,
                inviteCode: "ABCDEF",
                isHost: true,
                hostUserId: "11111111-1111-4111-8111-111111111111",
                phase: { kind: "step", phase: 3, step: 1 },
              },
        ),
  );
});
it("通常URLには検証機能を載せず、追従URLだけに載せる", async () => {
  const { unmount } = render(
    await RoomPage({ params: Promise.resolve({ id }) }),
  );
  expect(screen.queryByTestId("follower")).not.toBeInTheDocument();
  unmount();
  render(
    await RoomPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({ verify: "follow" }),
    }),
  );
  expect(screen.getByTestId("follower")).toBeInTheDocument();
});
it("通常起動では追従URLを指定しても検証機能を載せない", async () => {
  mocks.enabled.mockReturnValue(false);
  render(
    await RoomPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({ verify: "follow" }),
    }),
  );
  expect(screen.queryByTestId("follower")).not.toBeInTheDocument();
});
it("退出済みの完了時閲覧者は現在の在籍判定より先に再訪へ進む", async () => {
  mocks.api.mockImplementation(async (path: string) =>
    path.startsWith("/api/completed-rooms/")
      ? Response.json({ roomId: id })
      : Response.json({ error: "not found" }, { status: 404 }),
  );
  await expect(RoomPage({ params: Promise.resolve({ id }) })).rejects.toThrow(
    "redirect",
  );
  expect(mocks.api).not.toHaveBeenCalledWith(`/api/rooms/${id}`);
});
it("完了状態の確認が通信失敗したら再取得できる画面へ進む", async () => {
  mocks.api.mockRejectedValue(new Error("connection lost"));
  await expect(RoomPage({ params: Promise.resolve({ id }) })).rejects.toThrow(
    "redirect",
  );
});

it("残り時間が不足した新しい直リンクは共有画面をマウントしない", async () => {
  mocks.enough.mockReturnValue(false);
  render(await RoomPage({ params: Promise.resolve({ id }) }));
  expect(screen.getByText("入室前の認証確認")).toBeInTheDocument();
  expect(screen.queryByText("通常のボード")).not.toBeInTheDocument();
});
it("URLのentry指定だけで同じ入室として扱わずタブと一回消費を確認する", async () => {
  render(
    await RoomPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({ entry: "untrusted", tab: "untrusted" }),
    }),
  );
  expect(screen.getByText("入室前の認証確認")).toBeInTheDocument();
  expect(screen.queryByText("通常のボード")).not.toBeInTheDocument();
});

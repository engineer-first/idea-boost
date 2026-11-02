import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  enabled: vi.fn(),
  enough: vi.fn(),
  user: vi.fn(),
  redirect: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("@/features/verification", () => ({
  isVerificationEnabled: mocks.enabled,
  VerificationFollower: () => <span data-testid="follower" />,
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: mocks.user,
}));
vi.mock("@/features/auth", async (importOriginal) => ({
  getLoginPath: (await importOriginal<typeof import("@/features/auth")>())
    .getLoginPath,
  signOut: vi.fn(),
}));
vi.mock("@/lib/session/room-entry", () => ({
  hasRoomEntryTime: mocks.enough,
  issueRoomEntry: vi.fn().mockResolvedValue("admission"),
}));
vi.mock("@/features/room-lifecycle", async () => ({
  readParticipationRecovery: (
    await import("@/features/room-lifecycle/logic/participation-recovery")
  ).readParticipationRecovery,
  RoomAdmissionGate: ({ sessionKind }: { sessionKind?: string }) => (
    <span data-testid="admission-gate" data-session-kind={sessionKind}>
      入室前の認証確認
    </span>
  ),
  GuestIdentityUnavailable: ({ loginHref }: { loginHref?: string }) => (
    <span data-testid="identity-unavailable" data-login-href={loginHref} />
  ),
  ParticipationSwitch: ({
    pendingOperation,
    failedOperation,
  }: {
    pendingOperation?: { operationId: string };
    failedOperation?: { failure?: { operationId: string } };
  }) => (
    <span>
      既存参加先を整理
      <span data-testid="recovery-operation">
        {pendingOperation?.operationId ?? failedOperation?.failure?.operationId}
      </span>
    </span>
  ),
}));
vi.mock("@/features/room", () => ({
  RoomEntryPreview: () => <span>ルームの背景</span>,
  RoomBoard: () => <span>通常のボード</span>,
  RoomLobby: () => <span>通常のロビー</span>,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
  redirect: mocks.redirect,
}));

import RoomPage from "./page";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
vi.mock("@/lib/session/room-entry-session", () => ({
  prepareRoomEntrySession: mocks.prepare,
}));
vi.mock("@/lib/session/request-base-url", () => ({
  getRequestBaseUrl: async () => "https://example.test",
}));
beforeEach(() => {
  mocks.user.mockResolvedValue({ sub: "11111111-1111-4111-8111-111111111111" });
  mocks.prepare.mockClear();
  mocks.redirect.mockReset().mockImplementation(() => {
    throw new Error("redirect");
  });
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

it("旧複数参加の直リンクは整理確認を表示しボードを描画しない", async () => {
  const { switchConfirmation } = await import(
    "@/features/room-lifecycle/logic/participation.fixture"
  );
  mocks.api.mockImplementation(async (path: string) =>
    path.startsWith("/api/completed-rooms/")
      ? Response.json({}, { status: 404 })
      : Response.json({ confirmation: switchConfirmation() }, { status: 409 }),
  );
  render(await RoomPage({ params: Promise.resolve({ id }) }));
  expect(screen.getByText("既存参加先を整理")).toBeInTheDocument();
  expect(screen.queryByText("通常のボード")).not.toBeInTheDocument();
});

it.each(["board", "start"])(
  "%sの直接再訪で503 pendingを404にせず回復画面へ渡す",
  async (kind) => {
    const Page =
      kind === "board" ? RoomPage : (await import("./start/page")).default;
    mocks.api.mockImplementation(async (path: string) =>
      path.startsWith("/api/completed-rooms/")
        ? Response.json({}, { status: 404 })
        : Response.json(
            {
              kind: "pending",
              operationId: "22222222-2222-4222-8222-222222222222",
              progress: "joining",
              error: "結果を確認してください",
            },
            { status: 503 },
          ),
    );
    render(await Page({ params: Promise.resolve({ id }) }));
    expect(screen.getByText("既存参加先を整理")).toBeInTheDocument();
    expect(screen.queryByText("通常のボード")).not.toBeInTheDocument();
  },
);

it.each(["board", "start"])(
  "%sの確定失敗は終了した操作のIDを結果画面へ渡す",
  async (kind) => {
    const { failedParticipation } = await import(
      "@/features/room-lifecycle/logic/participation.fixture"
    );
    const Page =
      kind === "board" ? RoomPage : (await import("./start/page")).default;
    mocks.api.mockImplementation(async (path: string) =>
      path.startsWith("/api/completed-rooms/")
        ? Response.json({}, { status: 404 })
        : Response.json(failedParticipation(), { status: 409 }),
    );
    render(await Page({ params: Promise.resolve({ id }) }));
    expect(screen.getByTestId("recovery-operation")).toHaveTextContent(
      failedParticipation().failure.operationId,
    );
    expect(screen.queryByText("通常のボード")).not.toBeInTheDocument();
  },
);

it.each([
  { kind: "board", query: false },
  { kind: "start", query: false },
  { kind: "board", query: true },
  { kind: "start", query: true },
])(
  "$kindで本人がなくクエリ指定$queryなら復帰先付きのログイン先を本人確認不可画面へ渡す",
  async ({ kind, query }) => {
    mocks.user.mockResolvedValue(null);
    const Page =
      kind === "board" ? RoomPage : (await import("./start/page")).default;
    render(
      await Page({
        params: Promise.resolve({ id }),
        searchParams: query
          ? Promise.resolve({ verify: "follow", entry: "token", tab: "tab-id" })
          : undefined,
      }),
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
    const path = `/rooms/${id}${kind === "start" ? "/start" : ""}${query ? "?verify=follow&entry=token" : ""}`;
    expect(screen.getByTestId("identity-unavailable")).toHaveAttribute(
      "data-login-href",
      `/login?next=${encodeURIComponent(path)}&guest_next=%2Fhome`,
    );
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  },
);
it.each(["board", "start"])(
  "%sでゲストの時間が不足したら種別をgateへ渡し描画中にCookieを更新しない",
  async (kind) => {
    mocks.user.mockResolvedValue({
      kind: "guest",
      sub: "11111111-1111-4111-8111-111111111111",
      email: null,
      exp: 1800000000,
    });
    mocks.enough.mockReturnValue(false);
    if (kind === "start")
      mocks.api.mockImplementation(async (path: string) =>
        Response.json(
          path.endsWith("/members")
            ? { members: [] }
            : {
                roomId: id,
                inviteCode: "ABCDEF",
                isHost: true,
                hostUserId: "11111111-1111-4111-8111-111111111111",
                phase: { kind: "lobby" },
              },
        ),
      );
    const Page =
      kind === "board" ? RoomPage : (await import("./start/page")).default;
    render(await Page({ params: Promise.resolve({ id }) }));
    expect(screen.getByTestId("admission-gate")).toHaveAttribute(
      "data-session-kind",
      "guest",
    );
    expect(mocks.prepare).not.toHaveBeenCalled();
  },
);

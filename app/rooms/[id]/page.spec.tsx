import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoStatus } from "@/contracts/demo.fixture";
import { getInitialDemoStatus } from "@/features/demo";
import { apiFetch } from "@/lib/api-client";
import RoomPage from "./page";

vi.mock("@/features/demo", () => ({
  getInitialDemoStatus: vi.fn(),
  DemoPanel: () => <aside>デモ操作パネル</aside>,
}));
vi.mock("@/features/room", () => ({
  RoomBoard: () => <div>通常のルームボード</div>,
}));
vi.mock("@/features/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/features/invite", () => ({
  buildInviteUrl: () => "http://localhost:3000/invite/ABC123",
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: () => ({ sub: "d0000000-0000-4000-8000-000000000001" }),
}));
vi.mock("@/lib/session/env", () => ({
  getBaseUrl: () => "http://localhost:3000",
}));
const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeEach(() => {
  vi.mocked(apiFetch).mockImplementation(async (path) =>
    Response.json(
      path.endsWith("/members")
        ? { members: [] }
        : {
            roomId,
            inviteCode: "ABC123",
            hostUserId: "d0000000-0000-4000-8000-000000000001",
            isHost: true,
            phase: { kind: "step", phase: 1, step: 2 },
          },
    ),
  );
});
describe("ルーム画面のデモ操作", () => {
  it("デモルームでは通常のボードと操作パネルを表示する", async () => {
    vi.mocked(getInitialDemoStatus).mockResolvedValue(buildDemoStatus());
    render(await RoomPage({ params: Promise.resolve({ id: roomId }) }));
    expect(screen.getByText("通常のルームボード")).toBeInTheDocument();
    expect(screen.getByText("デモ操作パネル")).toBeInTheDocument();
  });
  it("通常のルームには操作パネルを表示しない", async () => {
    vi.mocked(getInitialDemoStatus).mockResolvedValue(null);
    render(await RoomPage({ params: Promise.resolve({ id: roomId }) }));
    expect(screen.queryByText("デモ操作パネル")).not.toBeInTheDocument();
  });
});

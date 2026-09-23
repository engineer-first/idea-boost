import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), enabled: vi.fn() }));
vi.mock("@/features/verification", () => ({
  isVerificationEnabled: mocks.enabled,
  VerificationFollower: () => <span data-testid="follower" />,
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: async () => ({ sub: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("@/features/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/features/room", () => ({
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
  mocks.enabled.mockReturnValue(true);
  mocks.api.mockImplementation(async (path: string) =>
    Response.json(
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

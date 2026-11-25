import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), confirm: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../logic/actions", () => ({ returnToRoom: mocks.confirm }));

import { RecentRoomsSection } from "./recent-rooms-section";

const userId = "11111111-1111-4111-8111-111111111111";
const active = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const done = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function respond(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json(body, { status })),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.confirm.mockResolvedValue({ kind: "ready", href: `/rooms/${active}` });
});
afterEach(() => vi.unstubAllGlobals());

it("参加したルームを状態つきで並べ、進行中はルームへ戻り、完了は成果を開く", async () => {
  respond({
    rooms: [
      { roomId: active, label: "チームA", status: "active" },
      {
        roomId: done,
        label: "通学路の見守りアプリ",
        status: "completed",
        completedAt: Date.UTC(2026, 10, 20),
      },
    ],
  });
  render(<RecentRoomsSection currentUserId={userId} />);
  const resume = await screen.findByRole("button", { name: /チームA/ });
  expect(resume).toHaveTextContent("進行中");
  const outcome = screen.getByRole("link", { name: /通学路の見守りアプリ/ });
  expect(outcome).toHaveAttribute("href", `/completed-rooms/${done}`);
  expect(outcome).toHaveTextContent("終了");
  expect(screen.getByRole("link", { name: "すべて見る" })).toHaveAttribute(
    "href",
    "/completed-rooms",
  );
  expect(fetch).toHaveBeenCalledWith("/api/recent-rooms", {
    cache: "no-store",
  });
  fireEvent.click(resume);
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(`/rooms/${active}`),
  );
  expect(mocks.confirm).toHaveBeenCalledWith(active, userId);
});

it("参加したルームが無ければ何も出さない", async () => {
  respond({ rooms: [] });
  const { container } = render(<RecentRoomsSection currentUserId={userId} />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(container).toBeEmptyDOMElement();
});

it("取得に失敗したら0件と区別して再試行できる", async () => {
  respond({ error: "unavailable" }, 503);
  render(<RecentRoomsSection currentUserId={userId} />);
  expect(
    await screen.findByRole("button", { name: "もう一度読み込む" }),
  ).toBeEnabled();
});

it("戻れなくなったルームは理由を示し、移動しない", async () => {
  respond({ rooms: [{ roomId: active, label: "チームA", status: "active" }] });
  mocks.confirm.mockResolvedValue({ kind: "unavailable_room" });
  render(<RecentRoomsSection currentUserId={userId} />);
  fireEvent.click(await screen.findByRole("button", { name: /チームA/ }));
  expect(
    await screen.findByText("このルームには戻れません。"),
  ).toBeInTheDocument();
  expect(mocks.push).not.toHaveBeenCalled();
});

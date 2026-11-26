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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
  expect(outcome).toHaveTextContent("完了・2026/11/20");
  expect(fetch).toHaveBeenCalledWith("/api/recent-rooms", {
    cache: "no-store",
  });
  fireEvent.click(resume);
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(`/rooms/${active}`),
  );
  expect(mocks.confirm).toHaveBeenCalledWith(active, userId);
});

it("作成日と自動削除までの残り日数を出し、値が無いルームには出さない", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 26, 3));
  respond({
    rooms: [
      {
        roomId: active,
        label: "チームA",
        status: "active",
        createdAt: Date.UTC(2026, 10, 24, 1),
        expiresAt: Date.UTC(2026, 10, 26, 3) + 2.5 * 24 * 60 * 60 * 1000,
      },
      {
        roomId: done,
        label: "通学路の見守りアプリ",
        status: "completed",
        completedAt: Date.UTC(2026, 10, 20),
      },
    ],
  });
  render(<RecentRoomsSection currentUserId={userId} />);
  const card = await screen.findByRole("button", { name: /チームA/ });
  expect(card).toHaveTextContent("2026/11/24 作成");
  expect(card).toHaveTextContent("あと3日で削除");
  const outcome = screen.getByRole("link", { name: /通学路の見守りアプリ/ });
  expect(outcome).not.toHaveTextContent("作成");
  expect(outcome).not.toHaveTextContent("削除");
});

it("参加したルームが無ければ何も出さない", async () => {
  respond({ rooms: [] });
  const { container } = render(<RecentRoomsSection currentUserId={userId} />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(container).toBeEmptyDOMElement();
});

it("取得に失敗したら0件と区別して再試行でき、成功したら一覧に戻る", async () => {
  respond({ error: "unavailable" }, 503);
  render(<RecentRoomsSection currentUserId={userId} />);
  const retry = await screen.findByRole("button", { name: "もう一度読み込む" });
  respond({ rooms: [{ roomId: active, label: "チームA", status: "active" }] });
  fireEvent.click(retry);
  expect(
    await screen.findByRole("button", { name: /チームA/ }),
  ).toBeInTheDocument();
});

it("開いている途中は同じ行をもう一度押せない", async () => {
  respond({ rooms: [{ roomId: active, label: "チームA", status: "active" }] });
  let finish: (value: unknown) => void = () => {};
  mocks.confirm.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  render(<RecentRoomsSection currentUserId={userId} />);
  const row = await screen.findByRole("button", { name: /チームA/ });
  fireEvent.click(row);
  await waitFor(() => expect(row).toBeDisabled());
  fireEvent.click(row);
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  finish({ kind: "retry" });
  await waitFor(() => expect(row).toBeEnabled());
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

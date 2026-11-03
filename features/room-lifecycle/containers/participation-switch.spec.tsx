import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { switchConfirmation } from "../logic/participation.fixture";
import { ParticipationSwitch } from "./participation-switch";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  push: vi.fn(),
  remember: vi.fn(),
}));
vi.mock("../logic/participation-actions", () => ({
  queryParticipation: mocks.query,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock("../logic/lifecycle-notify", () => ({
  lifecycleNotify: { rememberDeparture: mocks.remember },
}));
const actor = "11111111-1111-4111-8111-111111111111";
const roomId = "66666666-6666-4666-8666-666666666666";
beforeEach(() => vi.clearAllMocks());
it("旧確認待ちを再開しても追加確認なしでロビーへ進み、退出通知を到着後へ引き継ぐ", async () => {
  mocks.query.mockResolvedValueOnce({
    kind: "ready",
    roomId,
    exitedRoomNames: ["朝の相談"],
  });
  render(
    <ParticipationSwitch
      currentUserId={actor}
      confirmation={switchConfirmation()}
    />,
  );
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(`/rooms/${roomId}/start`),
  );
  expect(screen.getByRole("status")).toHaveTextContent("移動中");
  expect(mocks.query).toHaveBeenCalledExactlyOnceWith(
    switchConfirmation().operationId,
    actor,
  );
  expect(mocks.remember).toHaveBeenCalledWith(
    roomId,
    switchConfirmation().operationId,
    ["朝の相談"],
  );
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /退出|キャンセル/ }),
  ).not.toBeInTheDocument();
});
it("通信失敗では同じ操作をもう一度試し、二重送信を防ぐ", async () => {
  mocks.query.mockRejectedValueOnce(new Error("offline"));
  let finish!: (result: unknown) => void;
  mocks.query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <ParticipationSwitch
      currentUserId={actor}
      confirmation={switchConfirmation()}
    />,
  );
  const retry = await screen.findByRole("button", { name: "もう一度試す" });
  await userEvent.click(retry);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("移動中");
  await act(async () => finish({ kind: "ready", roomId }));
  expect(mocks.query).toHaveBeenCalledTimes(2);
  expect(mocks.query).toHaveBeenLastCalledWith(
    switchConfirmation().operationId,
    actor,
  );
});
it.each([false, true])(
  "別タブの操作を回復しても元の作成へ保存しない（同一操作:%s）",
  async (same) => {
    const operationId = same
      ? switchConfirmation().operationId
      : crypto.randomUUID();
    mocks.query.mockResolvedValueOnce({
      kind: "pending",
      operationId,
      progress: "joining",
      error: "internal",
    });
    mocks.query.mockResolvedValueOnce({ kind: "ready", roomId });
    const onReady = vi.fn().mockResolvedValue(undefined);
    render(
      <ParticipationSwitch
        currentUserId={actor}
        confirmation={switchConfirmation()}
        onReady={onReady}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "もう一度試す" }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(onReady).toHaveBeenCalledTimes(same ? 1 : 0);
    expect(screen.queryByText("internal")).not.toBeInTheDocument();
  },
);
it("保存中に本人が変わったら遷移しない", async () => {
  mocks.query.mockResolvedValueOnce({ kind: "ready", roomId });
  let finish!: () => void;
  const onReady = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <ParticipationSwitch
      currentUserId={actor}
      confirmation={switchConfirmation()}
      onReady={onReady}
    />,
  );
  await waitFor(() => expect(onReady).toHaveBeenCalled());
  view.rerender(
    <ParticipationSwitch
      currentUserId="22222222-2222-4222-8222-222222222222"
      confirmation={switchConfirmation()}
      onReady={onReady}
    />,
  );
  await act(async () => finish());
  expect(mocks.push).not.toHaveBeenCalled();
});
it("確定した失敗では内部IDや用語を出さずホームへ戻せる", () => {
  render(
    <ParticipationSwitch
      currentUserId={actor}
      failedOperation={{
        kind: "rejected",
        reason: "closed",
        error: "確認版 参加先 internal-id",
      }}
    />,
  );
  expect(screen.getByRole("link", { name: "ホームへ戻る" })).toHaveAttribute(
    "href",
    "/home",
  );
  expect(
    screen.queryByText(/確認版|参加先|internal-id/),
  ).not.toBeInTheDocument();
  expect(mocks.query).not.toHaveBeenCalled();
});

it("失敗時は見出し・説明一文・再試行ボタンだけを示し、案内を重複させない", async () => {
  mocks.query.mockRejectedValueOnce(new Error("offline"));
  render(
    <ParticipationSwitch
      currentUserId={actor}
      confirmation={switchConfirmation()}
    />,
  );
  await screen.findByRole("button", { name: "もう一度試す" });
  expect(
    screen.getByRole("heading", { name: "ルームに移動できませんでした" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText(/もう一度お試しください。/)).toHaveLength(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

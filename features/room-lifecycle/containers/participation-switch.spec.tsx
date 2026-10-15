import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { switchConfirmation } from "../logic/participation.fixture";
import { ParticipationSwitch } from "./participation-switch";

const commit = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock("../logic/participation-actions", () => ({
  commitParticipation: commit,
  queryParticipation: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
describe("参加先の確認", () => {
  it("確認を開くだけでは退出せず、既定の成果破棄を本人の確定で送る", async () => {
    commit.mockResolvedValue({
      kind: "rejected",
      reason: "busy",
      error: "処理中です",
    });
    render(
      <ParticipationSwitch
        currentUserId="11111111-1111-4111-8111-111111111111"
        confirmation={switchConfirmation()}
        onCancel={vi.fn()}
      />,
    );
    expect(commit).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "退出して参加する" }),
    );
    expect(commit).toHaveBeenCalledWith(
      switchConfirmation().operationId,
      "11111111-1111-4111-8111-111111111111",
      "discard",
      0,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("処理中です");
  });
  it("解散では成果選択を出さず、全員退出と招待URL失効を示す", () => {
    render(
      <ParticipationSwitch
        currentUserId="11111111-1111-4111-8111-111111111111"
        confirmation={switchConfirmation("disband")}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText(/切断中の人を含め全員/)).toBeInTheDocument();
    expect(screen.getByText(/招待URLは使えなく/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "解散して参加する" }),
    ).toBeInTheDocument();
  });
});

it("通信失敗後は取消を出さず、同じ操作を照会して再試行する", async () => {
  const { queryParticipation } = await import("../logic/participation-actions");
  commit.mockReset();
  commit.mockRejectedValueOnce(new Error("offline"));
  vi.mocked(queryParticipation).mockResolvedValueOnce({
    kind: "pending",
    operationId: switchConfirmation().operationId,
    progress: "leaving",
    error: "継続が必要です",
  });
  vi.mocked(queryParticipation).mockResolvedValueOnce({
    kind: "confirmation",
    confirmation: switchConfirmation("transfer"),
  });
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      confirmation={switchConfirmation()}
      onCancel={vi.fn()}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "退出して参加する" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("結果を確認");
  expect(
    screen.queryByRole("button", { name: "キャンセル" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "結果を確認・再試行" }),
  );
  expect(queryParticipation).toHaveBeenCalledWith(
    switchConfirmation().operationId,
    "11111111-1111-4111-8111-111111111111",
  );
  expect(commit).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: "キャンセル" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "結果を確認・再試行" }),
  );
  expect(queryParticipation).toHaveBeenLastCalledWith(
    switchConfirmation().operationId,
    "11111111-1111-4111-8111-111111111111",
  );
  expect(commit).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/佐藤/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "退出して参加する" }),
  ).toBeInTheDocument();
});

it("別タブの処理中操作を受け取ったら、その移動先とIDで結果確認を続ける", async () => {
  const { queryParticipation } = await import("../logic/participation-actions");
  commit.mockReset();
  vi.mocked(queryParticipation).mockReset();
  const other = {
    kind: "pending" as const,
    operationId: "55555555-5555-4555-8555-555555555555",
    progress: "joining" as const,
    targetName: "別タブで選んだルームC",
    error: "別タブで移動中です",
  };
  commit.mockResolvedValueOnce(other);
  vi.mocked(queryParticipation).mockResolvedValueOnce(other);
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      confirmation={switchConfirmation("disband")}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "解散して参加する" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "結果を確認・再試行" }),
  );
  expect(queryParticipation).toHaveBeenLastCalledWith(
    other.operationId,
    "11111111-1111-4111-8111-111111111111",
  );
  expect(screen.getByText(/移動先：別タブで選んだルームC/)).toBeInTheDocument();
  expect(screen.queryByText(/切断中の人を含め全員/)).not.toBeInTheDocument();
  expect(commit).toHaveBeenCalledTimes(1);
});

it.each([
  false,
  true,
])("回復した操作の成功を元の作成結果へ誤って保存しない（同一操作: %s）", async (sameOperation) => {
  const { queryParticipation } = await import("../logic/participation-actions");
  commit.mockReset();
  vi.mocked(queryParticipation).mockReset();
  push.mockReset();
  const original = switchConfirmation();
  const operationId = sameOperation
    ? original.operationId
    : "55555555-5555-4555-8555-555555555555";
  const roomId = "66666666-6666-4666-8666-666666666666";
  const onReady = vi.fn().mockResolvedValue(undefined);
  commit.mockResolvedValueOnce({
    kind: "pending",
    operationId,
    progress: "joining",
    error: "移動中です",
  });
  vi.mocked(queryParticipation).mockResolvedValueOnce({
    kind: "ready",
    roomId,
  });
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      confirmation={original}
      onReady={onReady}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "退出して参加する" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "結果を確認・再試行" }),
  );
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith(`/rooms/${roomId}/start`),
  );
  expect(onReady).toHaveBeenCalledTimes(sameOperation ? 1 : 0);
});

it("送信中は確定・取消・成果選択を無効にする", async () => {
  commit.mockReset();
  let finish!: (value: unknown) => void;
  commit.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      confirmation={switchConfirmation()}
      onCancel={vi.fn()}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "退出して参加する" }),
  );
  expect(screen.getByRole("button", { name: "処理中…" })).toBeDisabled();
  for (const radio of screen.getAllByRole("radio"))
    expect(radio).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "キャンセル" }),
  ).not.toBeInTheDocument();
  finish({
    kind: "rejected",
    reason: "busy",
    error: "保存処理の終了後に再試行してください。",
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("再試行");
});

it("再読込で発見した処理中の移動は取消なしに同じoperationを再開する", async () => {
  const { queryParticipation } = await import("../logic/participation-actions");
  vi.mocked(queryParticipation).mockResolvedValueOnce({
    kind: "confirmation",
    confirmation: switchConfirmation(),
  });
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      pendingOperation={{
        kind: "pending",
        operationId: switchConfirmation().operationId,
        progress: "leaving",
        error: "移動中です",
      }}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "キャンセル" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "結果を確認・再試行" }),
  );
  expect(queryParticipation).toHaveBeenCalledWith(
    switchConfirmation().operationId,
    "11111111-1111-4111-8111-111111111111",
  );
  expect(
    await screen.findByRole("button", { name: "退出して参加する" }),
  ).toBeInTheDocument();
});

it("一部退出済みの再確認は成果の選択を維持し、取消せず変更内容を確定する", async () => {
  commit.mockReset();
  const partial = {
    ...switchConfirmation("transfer"),
    progress: "partially_left" as const,
    outcomeAccess: "retain" as const,
  };
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      confirmation={partial}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "キャンセル" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /成果を残して退出/ })).toBeChecked();
  for (const radio of screen.getAllByRole("radio"))
    expect(radio).toBeDisabled();
  commit.mockResolvedValueOnce({
    kind: "rejected",
    reason: "busy",
    error: "再試行",
  });
  await userEvent.click(
    screen.getByRole("button", { name: "変更した内容を確認して続ける" }),
  );
  expect(commit).toHaveBeenCalledWith(
    partial.operationId,
    "11111111-1111-4111-8111-111111111111",
    "retain",
    0,
  );
});

it("復帰した移動の照会が処理中なら成果選択を上書きするcommitを送らない", async () => {
  const { queryParticipation } = await import("../logic/participation-actions");
  commit.mockReset();
  const pending = {
    kind: "pending" as const,
    operationId: switchConfirmation().operationId,
    progress: "joining" as const,
    error: "移動の処理中です",
  };
  vi.mocked(queryParticipation).mockResolvedValueOnce(pending);
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      pendingOperation={pending}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "結果を確認・再試行" }),
  );
  expect(commit).not.toHaveBeenCalled();
  expect(await screen.findByRole("alert")).toHaveTextContent("移動の処理中");
  expect(
    screen.getByRole("button", { name: "結果を確認・再試行" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "キャンセル" }),
  ).not.toBeInTheDocument();
});

it("確認表示で自然に取消へフォーカスし、Tabで決定へ進める", async () => {
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      confirmation={switchConfirmation()}
    />,
  );
  expect(screen.getByRole("button", { name: "キャンセル" })).toHaveFocus();
  await userEvent.tab();
  expect(
    screen.getByRole("button", { name: "退出して参加する" }),
  ).toHaveFocus();
});
it("処理中の復帰では自然に安全な結果確認へフォーカスする", () => {
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      pendingOperation={{
        kind: "pending",
        operationId: switchConfirmation().operationId,
        progress: "joining",
        error: "移動中",
      }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "結果を確認・再試行" }),
  ).toHaveFocus();
});

it("移動が確定失敗したら退出済みと残る参加先を示し、同じ操作を再送しない", async () => {
  commit.mockReset();
  commit.mockResolvedValueOnce({
    kind: "rejected",
    reason: "room_full",
    error: "移動先が満員になりました",
    failure: {
      operationId: switchConfirmation().operationId,
      exitedSources: [
        {
          roomId: "33333333-3333-4333-8333-333333333333",
          name: "元ルームA",
          result: "disbanded",
        },
      ],
      remainingSources: [
        { ...switchConfirmation().sources[0], name: "残るルームC" },
      ],
      currentRoomId: "33333333-3333-4333-8333-333333333333",
    },
  });
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      confirmation={switchConfirmation()}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "退出して参加する" }),
  );
  expect(
    await screen.findByText("移動の処理は終了しました"),
  ).toBeInTheDocument();
  expect(screen.getByText(/元ルームA.*解散済み/)).toBeInTheDocument();
  expect(screen.getByText(/残るルームC.*参加中/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "キャンセル" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "結果を確認・再試行" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "ホームで別のルームを選ぶ" }),
  ).toHaveAttribute("href", "/home");
  expect(
    screen.getByRole("link", { name: "ホームで別のルームを選ぶ" }),
  ).toHaveFocus();
});

it("取消後に元の操作へ自然にフォーカスが戻る", async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          参加先を確認する
        </button>
        {open && (
          <ParticipationSwitch
            currentUserId="11111111-1111-4111-8111-111111111111"
            confirmation={switchConfirmation()}
            onCancel={() => setOpen(false)}
          />
        )}
      </>
    );
  }
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "参加先を確認する" });
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("再確認後の決定には最新の確認versionを送り、古い同意を再利用しない", async () => {
  commit.mockReset();
  commit.mockResolvedValueOnce({
    kind: "confirmation",
    confirmation: { ...switchConfirmation("transfer"), version: 1 },
  });
  commit.mockResolvedValueOnce({
    kind: "rejected",
    reason: "busy",
    error: "再試行",
  });
  render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      confirmation={switchConfirmation()}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "退出して参加する" }),
  );
  expect(await screen.findByText(/佐藤/)).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "退出して参加する" }),
  );
  expect(commit).toHaveBeenLastCalledWith(
    switchConfirmation().operationId,
    "11111111-1111-4111-8111-111111111111",
    "discard",
    1,
  );
});

it("成功結果の保存中にアカウントが変わったら元のルームへ遷移しない", async () => {
  commit.mockReset();
  push.mockReset();
  const roomId = "66666666-6666-4666-8666-666666666666";
  commit.mockResolvedValueOnce({ kind: "ready", roomId });
  let finish!: () => void;
  const onReady = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <ParticipationSwitch
      currentUserId="11111111-1111-4111-8111-111111111111"
      confirmation={switchConfirmation()}
      onReady={onReady}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "退出して参加する" }),
  );
  await waitFor(() => expect(onReady).toHaveBeenCalledWith(roomId));
  view.rerender(
    <ParticipationSwitch
      currentUserId="22222222-2222-4222-8222-222222222222"
      confirmation={switchConfirmation()}
      onReady={onReady}
    />,
  );
  await act(async () => finish());
  expect(push).not.toHaveBeenCalled();
});

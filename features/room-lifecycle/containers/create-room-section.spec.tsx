import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueCreationId } from "@/contracts/room-creation";
import type { RoomCreationIntent } from "../logic/room-creation-storage";

const m = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  issue: vi.fn(),
  query: vi.fn(),
  returnTo: vi.fn(),
  save: vi.fn(),
  read: vi.fn(),
  submitted: vi.fn(),
  receipt: vi.fn(),
  selected: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("../logic/actions", () => ({
  createRoom: m.create,
  issueRoomCreation: m.issue,
  queryRoomCreation: m.query,
  returnToRoom: m.returnTo,
}));
vi.mock("../logic/room-creation-storage", () => ({
  readRoomCreationIntent: m.read,
  saveRoomCreationIntent: m.save,
  markRoomCreationSubmitted: m.submitted,
  saveRoomCreationResult: m.receipt,
  isRoomCreationSelected: m.selected,
  updateRoomCreationIntent: m.update,
  listRoomCreationIntents: m.list,
  clearRoomCreationIntent: m.clear,
  selectRoomCreationIntent: vi.fn(),
  subscribeRoomCreations: () => () => {},
  notifyRoomCreations: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notify: { error: vi.fn() } }));
vi.mock("../logic/lifecycle-notify", () => ({
  lifecycleNotify: { roomCreated: vi.fn() },
}));

import { CreateRoomSection } from "./create-room-section";

const USER = "11111111-1111-4111-8111-111111111111",
  OTHER = "22222222-2222-4222-8222-222222222222",
  ROOM = "33333333-3333-4333-8333-333333333333";
function intent(): RoomCreationIntent {
  return {
    ...issueCreationId(),
    expectedPrincipal: USER,
    name: "saved",
    generation: "generation",
    state: "submitted",
  };
}
async function click(label = "ルームを作成") {
  const button = await screen.findByRole("button", { name: label });
  await waitFor(() => expect(button).not.toBeDisabled());
  await userEvent.click(button);
}
beforeEach(() => {
  vi.resetAllMocks();
  m.read.mockResolvedValue(null);
  m.list.mockResolvedValue([]);
  m.issue.mockResolvedValue({ ok: true, issued: issueCreationId() });
  m.query.mockResolvedValue({
    ok: true,
    status: { kind: "unknown", acceptance: "open" },
  });
  m.save.mockImplementation(async (_u, v) => v);
  m.submitted.mockImplementation(async (_u, v) => ({
    ...v,
    state: "submitted",
  }));
  m.receipt.mockImplementation(async (_u, v, roomId) => ({
    ...v,
    state: "known",
    roomId,
    name: "",
  }));
  m.update.mockImplementation(async (_u, v, c) => ({ ...v, ...c }));
  m.selected.mockResolvedValue(true);
  m.create.mockResolvedValue({ ok: true, roomId: ROOM });
  m.returnTo.mockResolvedValue({ kind: "ready", href: `/rooms/${ROOM}/start` });
});
describe("作成控えからの回復", () => {
  it("発行→保存commit→submitted commit→create→receipt commit→遷移", async () => {
    const order: string[] = [];
    m.save.mockImplementation(async (_u, v) => {
      order.push("saved");
      return v;
    });
    m.submitted.mockImplementation(async (_u, v) => {
      order.push("submitted");
      return v;
    });
    m.create.mockImplementation(async () => {
      order.push("create");
      return { ok: true, roomId: ROOM };
    });
    m.receipt.mockImplementation(async (_u, v, roomId) => {
      order.push("receipt");
      return { ...v, roomId, state: "known" };
    });
    m.push.mockImplementation(() => order.push("push"));
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() =>
      expect(order).toEqual([
        "saved",
        "submitted",
        "create",
        "receipt",
        "push",
      ]),
    );
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedPrincipal: USER,
        requestId: expect.any(String),
      }),
    );
  });
  it("送信結果不明を復元し同IDで再試行、名前を固定", async () => {
    const saved = intent();
    m.read.mockResolvedValue(saved);
    m.create.mockResolvedValue({
      ok: false,
      outcome: "unknown",
      error: "unknown",
    });
    render(<CreateRoomSection currentUserId={USER} />);
    await click("前回の作成を確認");
    expect(screen.getByRole("textbox")).toHaveValue("saved");
    expect(screen.getByRole("textbox")).toBeDisabled();
    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith({
        requestId: saved.requestId,
        expectedPrincipal: USER,
        name: "saved",
      }),
    );
    expect(m.issue).not.toHaveBeenCalled();
  });
  it("期限後はPOSTせずunknownを失敗と断言しない", async () => {
    m.read.mockResolvedValue(intent());
    m.query.mockResolvedValue({
      ok: true,
      status: { kind: "unknown", acceptance: "expired" },
    });
    render(<CreateRoomSection currentUserId={USER} />);
    await click("前回の作成を確認");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("作成された可能性"),
    );
    expect(m.create).not.toHaveBeenCalled();
  });
  it("known receiptなら期限と無関係に通常再訪しPOSTしない", async () => {
    m.read.mockResolvedValue({ ...intent(), state: "known", roomId: ROOM });
    render(<CreateRoomSection currentUserId={USER} />);
    await click("作成済みのルームを開く");
    await waitFor(() => expect(m.push).toHaveBeenCalled());
    expect(m.create).not.toHaveBeenCalled();
    expect(m.query).not.toHaveBeenCalled();
  });
  it("遷移失敗でも成功receiptが残り新規発行に戻らない", async () => {
    m.push.mockImplementation(() => {
      throw new Error("navigation failed");
    });
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("作成済み"),
    );
    await click("作成済みのルームを開く");
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.issue).toHaveBeenCalledTimes(1);
    expect(m.clear).not.toHaveBeenCalled();
  });
  it("保存commit失敗ではcreateしない", async () => {
    m.save.mockRejectedValue(new Error("abort"));
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("保存"),
    );
    expect(m.create).not.toHaveBeenCalled();
  });
  it("別tabの勝者を黙って送らない", async () => {
    m.save.mockResolvedValue(intent());
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("別タブ"),
    );
    expect(m.create).not.toHaveBeenCalled();
  });
  it("Aの遅い成功はBの画面を遷移・保存しない", async () => {
    let resolve!: (v: unknown) => void;
    m.create.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() => expect(m.create).toHaveBeenCalled());
    view.rerender(<CreateRoomSection currentUserId={OTHER} />);
    resolve({ ok: true, roomId: ROOM });
    await waitFor(() => expect(m.receipt).toHaveBeenCalled());
    expect(m.push).not.toHaveBeenCalled();
    expect(m.receipt.mock.calls[0][0]).toBe(USER);
  });
  it("selectedが変わった古い応答は現在UIへ反映・遷移しない", async () => {
    let resolve!: (v: unknown) => void;
    m.create.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() => expect(m.create).toHaveBeenCalled());
    m.selected.mockResolvedValue(false);
    resolve({ ok: true, roomId: ROOM });
    await waitFor(() => expect(m.receipt).toHaveBeenCalled());
    expect(m.push).not.toHaveBeenCalled();
  });
});
it("別作成のlist読込中にactorが変わっても旧actorの控えを表示しない", async () => {
  const saved = intent();
  m.read.mockResolvedValueOnce(saved).mockResolvedValue(null);
  let release!: (v: RoomCreationIntent[]) => void;
  const barrier = new Promise<RoomCreationIntent[]>((r) => {
    release = r;
  });
  m.list
    .mockResolvedValueOnce([])
    .mockReturnValueOnce(barrier)
    .mockResolvedValue([]);
  const view = render(<CreateRoomSection currentUserId={USER} />);
  await click("別のルームを新しく作成");
  await waitFor(() => expect(m.list).toHaveBeenCalledTimes(2));
  view.rerender(<CreateRoomSection currentUserId={OTHER} />);
  await waitFor(() => expect(m.list).toHaveBeenCalledTimes(3));
  release([saved]);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "ルームを作成" }),
    ).not.toBeDisabled(),
  );
  expect(
    screen.queryByRole("button", { name: "結果を確認: saved" }),
  ).not.toBeInTheDocument();
});
it("actor不一致の保存中に選択が変わっても旧応答でボタンを永久停止しない", async () => {
  m.read.mockResolvedValue(intent());
  m.create.mockResolvedValue({
    ok: false,
    outcome: "rejected",
    reason: "actor_mismatch",
    error: "actor changed",
  });
  let release!: (v: RoomCreationIntent) => void;
  m.update.mockReturnValue(
    new Promise<RoomCreationIntent>((r) => {
      release = r;
    }),
  );
  render(<CreateRoomSection currentUserId={USER} />);
  await click("前回の作成を確認");
  await waitFor(() => expect(m.update).toHaveBeenCalled());
  m.selected.mockResolvedValue(false);
  release({ ...intent(), state: "actor_mismatch" });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "前回の作成を確認" }),
    ).not.toBeDisabled(),
  );
});
it("同じ利用者で再ログインしたactor mismatch控えは同IDで回復できる", async () => {
  m.read.mockResolvedValue({ ...intent(), state: "actor_mismatch" });
  render(<CreateRoomSection currentUserId={USER} />);
  await click("前回の作成を確認");
  await waitFor(() => expect(m.push).toHaveBeenCalled());
  expect(m.issue).not.toHaveBeenCalled();
});
it("input conflict控えの確認はstatusだけで、恒久拒否POSTを繰り返さない", async () => {
  m.read.mockResolvedValue({ ...intent(), state: "conflict" });
  render(<CreateRoomSection currentUserId={USER} />);
  await click("前回の作成を確認");
  await waitFor(() => expect(m.query).toHaveBeenCalled());
  expect(m.create).not.toHaveBeenCalled();
});

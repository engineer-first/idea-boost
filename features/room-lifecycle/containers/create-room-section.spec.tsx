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
async function click(label = "新しいルームを作成") {
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
    await click("もう一度試す");
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
    await click("前のルームを探す");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "前のルームを開けません",
      ),
    );
    expect(m.create).not.toHaveBeenCalled();
  });
  it("送信前の保存で別タブの成功receiptを得たらPOSTせず同じルームへ進む", async () => {
    const saved = intent();
    m.read.mockResolvedValue(saved);
    m.submitted.mockResolvedValue({
      ...saved,
      state: "known",
      roomId: ROOM,
      name: "",
    });
    // 再送すると元の名前と衝突する。成功済みなら通常再訪だけで進む。
    m.create.mockResolvedValue({
      ok: false,
      outcome: "rejected",
      reason: "input_conflict",
      error: "同じ作成要求の入力を変更できません。",
    });
    render(<CreateRoomSection currentUserId={USER} />);
    await click("もう一度試す");
    await waitFor(() =>
      expect(m.push).toHaveBeenCalledWith(`/rooms/${ROOM}/start`),
    );
    expect(m.returnTo).toHaveBeenCalledWith(ROOM);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.issue).not.toHaveBeenCalled();
  });
  it("遷移失敗でも成功receiptが残り新規発行に戻らない", async () => {
    m.push.mockImplementation(() => {
      throw new Error("navigation failed");
    });
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "ルームを開けません",
      ),
    );
    await click("もう一度試す");
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
it("Aの初期照会が遅れても切替後のBへ古いルームを表示しない", async () => {
  m.read.mockResolvedValueOnce(intent()).mockResolvedValue(null);
  let release!: (value: unknown) => void;
  m.query.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const view = render(<CreateRoomSection currentUserId={USER} />);
  await waitFor(() => expect(m.query).toHaveBeenCalled());
  view.rerender(<CreateRoomSection currentUserId={OTHER} />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "新しいルームを作成" }),
    ).toBeEnabled(),
  );
  release({
    ok: true,
    status: { kind: "ready", roomId: ROOM, acceptance: "open" },
  });
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  expect(m.receipt).not.toHaveBeenCalled();
  expect(m.push).not.toHaveBeenCalled();
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
  await click("もう一度試す");
  await waitFor(() => expect(m.update).toHaveBeenCalled());
  m.selected.mockResolvedValue(false);
  release({ ...intent(), state: "actor_mismatch" });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "もう一度試す" }),
    ).not.toBeDisabled(),
  );
});
it("同じ利用者で再ログインしたactor mismatch控えは同IDで回復できる", async () => {
  m.read.mockResolvedValue({ ...intent(), state: "actor_mismatch" });
  render(<CreateRoomSection currentUserId={USER} />);
  await click("もう一度試す");
  await waitFor(() => expect(m.push).toHaveBeenCalled());
  expect(m.issue).not.toHaveBeenCalled();
});
it("input conflict控えの確認はstatusだけで、恒久拒否POSTを繰り返さない", async () => {
  m.read.mockResolvedValue({ ...intent(), state: "conflict" });
  render(<CreateRoomSection currentUserId={USER} />);
  await click("もう一度試す");
  await waitFor(() => expect(m.query).toHaveBeenCalled());
  expect(m.create).not.toHaveBeenCalled();
});

it("成功済みのルームがあっても名前を入力し別IDで新しいルームを作成する", async () => {
  const previous = { ...intent(), state: "known" as const, roomId: ROOM };
  m.read.mockResolvedValue(previous);
  render(<CreateRoomSection currentUserId={USER} />);
  const name = screen.getByRole("textbox", { name: "ルーム名（任意）" });
  await waitFor(() => expect(name).toBeEnabled());
  await userEvent.type(name, "次の会");
  await click("新しいルームを作成");
  await waitFor(() => expect(m.create).toHaveBeenCalled());
  expect(m.create.mock.calls[0][0]).toMatchObject({ name: "次の会" });
  expect(m.create.mock.calls[0][0].requestId).not.toBe(previous.requestId);
  expect(m.save).toHaveBeenCalledWith(
    USER,
    expect.anything(),
    previous.requestId,
  );
  expect(m.clear).not.toHaveBeenCalled();
});

it("期限後の中断は新規作成が主操作で、確認のキャンセルでは発行もPOSTもしない", async () => {
  const previous = intent();
  m.read.mockResolvedValue(previous);
  m.query.mockResolvedValue({
    ok: true,
    status: { kind: "unknown", acceptance: "expired" },
  });
  render(<CreateRoomSection currentUserId={USER} />);
  await click("新しいルームを作成");
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  expect(m.issue).not.toHaveBeenCalled();
  expect(m.create).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(m.clear).not.toHaveBeenCalled();
});

it("中断時の別作成は作成直前だけ確認し、承認後に新しい名前とIDを送る", async () => {
  const previous = intent();
  m.read.mockResolvedValue(previous);
  render(<CreateRoomSection currentUserId={USER} />);
  await click("新しいルームを作成");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByRole("textbox", { name: "ルーム名（任意）" }),
    "別の会",
  );
  await click("新しいルームを作成");
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  expect(m.create).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "新しいルームを作成する" }),
  );
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(1));
  expect(m.create.mock.calls[0][0]).toMatchObject({ name: "別の会" });
  expect(m.create.mock.calls[0][0].requestId).not.toBe(previous.requestId);
});

it("ホームの自動確認で通信が失敗しても保存エラーにせず同じ作成を再試行できる", async () => {
  const previous = intent();
  m.read.mockResolvedValue(previous);
  m.query.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue({
    ok: true,
    status: { kind: "unknown", acceptance: "open" },
  });
  render(<CreateRoomSection currentUserId={USER} />);
  await click("もう一度試す");
  await waitFor(() => expect(m.create).toHaveBeenCalled());
  expect(m.create.mock.calls[0][0].requestId).toBe(previous.requestId);
  expect(
    screen.queryByRole("button", { name: "このブラウザの保存をリセット" }),
  ).not.toBeInTheDocument();
});

it("新規作成の応答が途切れたらもう一度試すへ切り替え同IDを使う", async () => {
  m.create
    .mockResolvedValueOnce({ ok: false, outcome: "unknown", error: "offline" })
    .mockResolvedValue({ ok: true, roomId: ROOM });
  render(<CreateRoomSection currentUserId={USER} />);
  await click();
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("もう一度"),
  );
  const firstId = m.create.mock.calls[0][0].requestId;
  await click("もう一度試す");
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(2));
  expect(m.create.mock.calls[1][0].requestId).toBe(firstId);
  expect(m.issue).toHaveBeenCalledTimes(1);
});

it("送信時に期限を過ぎた場合も名前を消し新規作成を主操作にする", async () => {
  m.create.mockResolvedValue({
    ok: false,
    outcome: "rejected",
    reason: "expired",
    error: "作成受付の期限が過ぎました。結果を確認してください。",
  });
  render(<CreateRoomSection currentUserId={USER} />);
  await click();
  await waitFor(() =>
    expect(m.update).toHaveBeenCalledWith(USER, expect.anything(), {
      state: "expired",
      name: "",
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "ルーム名（任意）" }),
    ).toBeEnabled(),
  );
  expect(
    screen.queryByRole("button", { name: "もう一度試す" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "新しいルームを作成" }),
  ).toBeEnabled();
});

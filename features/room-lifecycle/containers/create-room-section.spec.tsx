import { loadDisplayName } from "@/features/auth";

vi.mock("@/features/auth/logic/display-name-actions", () => ({
  loadDisplayName: vi.fn(async () => ({ ok: true, name: "保存済み" })),
  saveDisplayName: vi.fn(),
}));

import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
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
  opened: vi.fn(),
  refresh: () => {},
  participationQuery: vi.fn(),
}));
vi.mock("@/features/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth")>()),
  startRoomReauthentication: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: m.push }),
}));
vi.mock("../logic/participation-actions", () => ({
  queryParticipation: m.participationQuery,
  commitParticipation: vi.fn(),
}));
vi.mock("../logic/actions", () => ({
  createRoom: m.create,
  issueRoomCreation: m.issue,
  queryRoomCreation: m.query,
  returnToRoom: m.returnTo,
}));
vi.mock("../logic/room-creation-storage", () => ({
  wasRoomCreationOpened: m.opened,
  readRoomCreationIntent: m.read,
  saveRoomCreationIntent: m.save,
  markRoomCreationSubmitted: m.submitted,
  saveRoomCreationResult: m.receipt,
  isRoomCreationSelected: m.selected,
  updateRoomCreationIntent: m.update,
  listRoomCreationIntents: m.list,
  clearRoomCreationIntent: m.clear,
  selectRoomCreationIntent: vi.fn(),
  subscribeRoomCreations: (onChange: () => void) => {
    m.refresh = onChange;
    return () => {};
  },
  notifyRoomCreations: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notify: { error: vi.fn() } }));
vi.mock("../logic/lifecycle-notify", () => ({
  lifecycleNotify: { roomCreated: vi.fn(), rememberDeparture: vi.fn() },
}));

import { useRoomCreation } from "../logic/use-room-creation";
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
  m.opened.mockReturnValue(false);
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
    unopened: true,
  }));
  m.update.mockImplementation(async (_u, v, c) => ({ ...v, ...c }));
  m.selected.mockResolvedValue(true);
  m.create.mockResolvedValue({ ok: true, roomId: ROOM });
  m.returnTo.mockResolvedValue({ kind: "ready", href: `/rooms/${ROOM}/start` });
});
describe("ホームからのルーム作成", () => {
  it("確認なしで入力した名前のルームを作成する", async () => {
    render(<CreateRoomSection currentUserId={USER} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    await userEvent.type(screen.getByRole("textbox"), "相談");
    await click();
    await waitFor(() =>
      expect(m.push).toHaveBeenCalledWith(`/rooms/${ROOM}/start`),
    );
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "相談" }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("未送信の前回分を再送せず新しいIDと名前で作成する", async () => {
    const previous = { ...intent(), state: "prepared" as const };
    m.read.mockResolvedValue(previous);
    render(<CreateRoomSection currentUserId={USER} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    await userEvent.type(screen.getByRole("textbox"), "次の相談");
    await click();
    await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
    expect(m.create.mock.lastCall?.[0].requestId).not.toBe(previous.requestId);
    expect(m.create.mock.lastCall?.[0].name).toBe("次の相談");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("前回成立した未開封のルームを開き、新しいルームを作らない", async () => {
    m.read.mockResolvedValue(intent());
    m.query.mockResolvedValue({
      ok: true,
      status: { kind: "ready", roomId: ROOM, acceptance: "open" },
    });
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() =>
      expect(m.push).toHaveBeenCalledWith(`/rooms/${ROOM}/start`),
    );
    expect(m.create).not.toHaveBeenCalled();
    expect(m.issue).not.toHaveBeenCalled();
  });
  it("すでに開いたルームの控えが残っていても新規作成する", async () => {
    const previous = {
      ...intent(),
      state: "known" as const,
      roomId: ROOM,
      unopened: true,
    };
    m.read.mockResolvedValue(previous);
    m.opened.mockReturnValue(true);
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
    expect(m.create.mock.lastCall?.[0].requestId).not.toBe(previous.requestId);
  });
  it.each(["closed", "expired"] as const)(
    "前回分が%sなら確認なしで新規作成する",
    async (state) => {
      m.read.mockResolvedValue({ ...intent(), state });
      render(<CreateRoomSection currentUserId={USER} />);
      await click();
      await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    },
  );
  it("結果不明の再試行では同じIDを送り、新しいIDを発行しない", async () => {
    m.create
      .mockResolvedValueOnce({
        ok: false,
        outcome: "unknown",
        error: "作成要求 internal-id",
      })
      .mockResolvedValue({ ok: true, roomId: ROOM });
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await screen.findByRole("status");
    expect(screen.getByRole("status")).not.toHaveTextContent(
      /作成要求|internal-id|参加状況|保存/,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    const first = m.create.mock.calls[0][0];
    await click("もう一度試す");
    await waitFor(() => expect(m.push).toHaveBeenCalled());
    expect(m.create).toHaveBeenNthCalledWith(2, first);
    expect(m.issue).toHaveBeenCalledOnce();
  });
  it("結果不明の控えを再送しても別のルームを発行しない", async () => {
    const previous = intent();
    m.read.mockResolvedValue(previous);
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith({
        expectedPrincipal: USER,
        requestId: previous.requestId,
        name: previous.name,
      }),
    );
    expect(m.issue).not.toHaveBeenCalled();
  });
  it.each(["read", "save", "submitted", "receipt", "selected"] as const)(
    "%sの保存失敗でも作成と移動を試みる",
    async (operation) => {
      m[operation].mockRejectedValue(new Error("storage blocked"));
      render(<CreateRoomSection currentUserId={USER} />);
      await click();
      await waitFor(() => expect(m.push).toHaveBeenCalled());
      expect(m.create).toHaveBeenCalledOnce();
      expect(screen.queryByText(/保存設定|リセット/)).not.toBeInTheDocument();
    },
  );
  it("保存できず応答が途切れても同じ要求で再試行する", async () => {
    m.read.mockRejectedValue(new Error("blocked"));
    m.save.mockRejectedValue(new Error("blocked"));
    m.create
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, roomId: ROOM });
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await screen.findByRole("status");
    const first = m.create.mock.calls[0][0];
    await click("もう一度試す");
    await waitFor(() => expect(m.push).toHaveBeenCalled());
    expect(m.create).toHaveBeenNthCalledWith(2, first);
    expect(m.issue).toHaveBeenCalledOnce();
  });
  it("移動失敗後も同じルームへ再試行し二重作成しない", async () => {
    m.push.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await screen.findByRole("status");
    await click("もう一度試す");
    await waitFor(() => expect(m.push).toHaveBeenCalledTimes(2));
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.issue).toHaveBeenCalledOnce();
  });
  it("別タブが保存した成功結果があれば再送しない", async () => {
    const previous = intent();
    m.read.mockResolvedValue(previous);
    m.submitted.mockResolvedValue({
      ...previous,
      state: "known",
      roomId: ROOM,
    });
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() => expect(m.push).toHaveBeenCalled());
    expect(m.create).not.toHaveBeenCalled();
    expect(m.issue).not.toHaveBeenCalled();
  });
  it("利用者切替前の遅い成功は切替後の画面を移動しない", async () => {
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
    await act(async () => resolve({ ok: true, roomId: ROOM }));
    expect(m.push).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "新しいルームを作成" }),
      ).toBeEnabled(),
    );
  });
  it("別タブで選択が変わった後の応答では移動しない", async () => {
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
    await act(async () => resolve({ ok: true, roomId: ROOM }));
    expect(m.push).not.toHaveBeenCalled();
  });
});

it.each(["unavailable", "completed"] as const)(
  "前回の未開封ルームが%sなら古いルームへ移動せず新規作成する",
  async (status) => {
    const previous = {
      ...intent(),
      state: "known" as const,
      roomId: ROOM,
      unopened: true,
    };
    m.read.mockResolvedValue(previous);
    m.returnTo.mockResolvedValueOnce(
      status === "unavailable"
        ? { kind: "unavailable_room" }
        : { kind: "ready", href: `/completed-rooms/${ROOM}` },
    );
    render(<CreateRoomSection currentUserId={USER} />);
    await click();
    await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
    expect(m.create.mock.lastCall?.[0].requestId).not.toBe(previous.requestId);
    expect(m.push).not.toHaveBeenCalledWith(`/completed-rooms/${ROOM}`);
  },
);

it("再ログイン中も作成カードとルーム名を保持し、戻ると入力を再開できる", async () => {
  m.create.mockResolvedValue({ ok: false, reason: "reauth_required" });
  render(<CreateRoomSection currentUserId={USER} />);
  const input = await screen.findByLabelText("ルーム名（任意）");
  await waitFor(() => expect(input).toBeEnabled());
  await userEvent.type(input, "新サービスの相談");
  await click();
  await screen.findByRole("button", { name: "Googleでログインして続ける" });
  expect(screen.getByTestId("home-create-room")).toBeInTheDocument();
  expect(screen.getByLabelText("ルーム名（任意）")).toHaveValue(
    "新サービスの相談",
  );
  await userEvent.click(screen.getByRole("button", { name: "戻る" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("ルーム名（任意）")).toHaveValue(
    "新サービスの相談",
  );
  expect(m.push).not.toHaveBeenCalled();
});

it("共通表示名が未設定でも設定ダイアログを出さず、作成を続ける", async () => {
  vi.mocked(loadDisplayName).mockResolvedValueOnce({ ok: true, name: null });
  render(<CreateRoomSection currentUserId={USER} />);
  await click();
  await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
  expect(
    screen.queryByRole("dialog", { name: "表示名を設定" }),
  ).not.toBeInTheDocument();
  expect(loadDisplayName).not.toHaveBeenCalled();
});

it("通常の作成中は回復案内を出さず、成功後も移動まで名前と準備中を保持する", async () => {
  let resolveCreate!: (value: { ok: true; roomId: string }) => void;
  m.create.mockReturnValue(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );
  render(<CreateRoomSection currentUserId={USER} />);
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  await userEvent.type(screen.getByRole("textbox"), "新サービスの相談");
  await click();
  await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
  expect(
    screen.queryByText(/準備したルーム|移動が途中/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "新しいルームを作成" }),
  ).not.toBeInTheDocument();
  await act(async () => resolveCreate({ ok: true, roomId: ROOM }));
  await waitFor(() => expect(m.push).toHaveBeenCalledOnce());
  expect(screen.getByRole("textbox")).toHaveValue("新サービスの相談");
  expect(screen.getByRole("button", { name: "準備中…" })).toBeDisabled();
});

it("移動が完了しない場合は保存済みの同じルームへ再試行できる", async () => {
  const { result } = renderHook(() => useRoomCreation(USER));
  await waitFor(() => expect(result.current.pending).toBe(false));
  vi.useFakeTimers();
  try {
    await act(async () => result.current.onSubmit("相談"));
    expect(m.push).toHaveBeenCalledOnce();
    expect(result.current.pending).toBe(true);
    act(() => result.current.onSubmit("別のルーム"));
    expect(m.issue).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current.pending).toBe(false);
    expect(result.current.message).toContain("もう一度");
    await act(async () => result.current.onSubmit(""));
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.issue).toHaveBeenCalledOnce();
    expect(m.push).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it("参加中の新規作成でも確認なしでロビーへ進む", async () => {
  m.create.mockResolvedValue({
    ok: true,
    roomId: ROOM,
    operationId: "move",
    exitedRoomNames: ["前の相談"],
  });
  render(<CreateRoomSection currentUserId={USER} />);
  await click();
  await waitFor(() => expect(m.push).toHaveBeenCalled());
  expect(
    screen.queryByRole("button", { name: /退出して|キャンセル/ }),
  ).not.toBeInTheDocument();
});

it("旧作成K1の処理を再開しても新作成K2の控えへ結果を記録しない", async () => {
  const k2 = intent();
  const k1 = "55555555-5555-4555-8555-555555555555";
  m.read.mockResolvedValue(k2);
  m.create.mockResolvedValue({
    ok: false,
    outcome: "unknown",
    error: "前の作成が進行中です",
    pendingOperation: {
      kind: "pending",
      operationId: "22222222-2222-4222-8222-222222222222",
      progress: "joining",
      error: "前の作成が進行中です",
      target: {
        kind: "create",
        input: { requestId: k1, expectedPrincipal: USER, name: "前のルーム" },
      },
      targetName: "前のルーム",
    },
  });
  m.participationQuery.mockResolvedValue({ kind: "ready", roomId: ROOM });
  render(<CreateRoomSection currentUserId={USER} />);
  await click();
  await waitFor(() => expect(m.push).toHaveBeenCalled());
  expect(m.receipt).not.toHaveBeenCalled();
});

it("同じ作成要求の移動が成功した場合はその控えへ結果を記録する", async () => {
  const saved = intent();
  m.read.mockResolvedValue(saved);
  m.create.mockResolvedValue({
    ok: false,
    outcome: "unknown",
    error: "移動中",
    pendingOperation: {
      kind: "pending",
      operationId: "22222222-2222-4222-8222-222222222222",
      progress: "joining",
      error: "移動中",
      target: {
        kind: "create",
        input: {
          requestId: saved.requestId,
          expectedPrincipal: USER,
          name: saved.name,
        },
      },
      targetName: saved.name,
    },
  });
  m.participationQuery.mockResolvedValue({ kind: "ready", roomId: ROOM });
  render(<CreateRoomSection currentUserId={USER} />);
  await click();
  await waitFor(() =>
    expect(m.receipt).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ requestId: saved.requestId }),
      ROOM,
    ),
  );
});

it("別タブで未送信分の作成が成立していたら最新の控えを読み新規発行しない", async () => {
  const previous = { ...intent(), state: "prepared" as const };
  m.read.mockResolvedValueOnce(previous).mockResolvedValue({
    ...previous,
    state: "known",
    roomId: ROOM,
    unopened: true,
  });
  render(<CreateRoomSection currentUserId={USER} />);
  await click();
  await waitFor(() => expect(m.push).toHaveBeenCalled());
  expect(m.issue).not.toHaveBeenCalled();
  expect(m.create).not.toHaveBeenCalled();
});

it("保存中に別タブが選んだ使用済みルームへは移動せず再試行できる", async () => {
  m.save.mockResolvedValue({
    ...intent(),
    state: "known",
    roomId: ROOM,
    unopened: true,
  });
  m.opened.mockReturnValue(true);
  render(<CreateRoomSection currentUserId={USER} />);
  await click();
  await screen.findByRole("button", { name: "もう一度試す" });
  expect(m.create).not.toHaveBeenCalled();
  expect(m.push).not.toHaveBeenCalled();
});

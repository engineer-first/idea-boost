import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  create: vi.fn(),
  join: vi.fn(),
  query: vi.fn(),
  returnRoom: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/features/auth", () => ({
  consumeRoomResume: mocks.consume,
  bindRoomEntryContinuation: vi.fn(),
}));
vi.mock("../logic/actions", () => ({
  createRoom: mocks.create,
  joinRoom: mocks.join,
  queryRoomCreation: mocks.query,
  returnToRoom: mocks.returnRoom,
}));
vi.mock("../logic/room-creation-storage", () => ({
  readRoomCreationIntent: vi.fn().mockResolvedValue(null),
  saveRoomCreationResult: vi.fn(),
}));

import { RoomOperationResume } from "./room-operation-resume";

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});
it("別人で戻った場合は元操作を実行せず本文を表示しない", async () => {
  mocks.consume.mockResolvedValue({ ok: false, reason: "account_changed" });
  render(<RoomOperationResume />);
  await screen.findByText(/アカウントが変わりました/);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.join).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("同じ本人の作成再開は元requestIdを照会し、成功済みなら再作成しない", async () => {
  const principal = "11111111-1111-4111-8111-111111111111",
    roomId = "22222222-2222-4222-8222-222222222222";
  mocks.consume.mockResolvedValue({
    ok: true,
    principal,
    operation: {
      kind: "create",
      input: {
        expectedPrincipal: principal,
        requestId: "33333333-3333-4333-8333-333333333333",
        name: "元の入力",
      },
    },
  });
  mocks.query.mockResolvedValue({
    ok: true,
    status: { kind: "ready", roomId },
  });
  mocks.returnRoom.mockResolvedValue({
    kind: "ready",
    href: `/rooms/${roomId}/start`,
  });
  render(<RoomOperationResume />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(`/rooms/${roomId}/start`),
  );
  expect(mocks.query).toHaveBeenCalledWith(
    principal,
    "33333333-3333-4333-8333-333333333333",
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
it("操作を確認できない場合に自動参加しない", async () => {
  mocks.consume.mockResolvedValue({ ok: false, reason: "unavailable" });
  render(<RoomOperationResume />);
  await screen.findByText(/元の操作を確認できません/);
  expect(mocks.join).not.toHaveBeenCalled();
});
it("OAuthが別アカウントを拒否した戻り先では元の本人でログインする案内を出しgrantを消費しない", async () => {
  render(<RoomOperationResume initialError="account_changed" />);
  expect(
    await screen.findByText(/元のアカウントでログイン/),
  ).toBeInTheDocument();
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

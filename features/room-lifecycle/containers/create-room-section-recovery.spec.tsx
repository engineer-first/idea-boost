vi.mock("@/features/auth/logic/display-name-actions", () => ({
  loadDisplayName: vi.fn(async () => ({ ok: true, name: "保存済み" })),
  saveDisplayName: vi.fn(),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi
    .fn()
    .mockResolvedValue({ ok: false, outcome: "unknown", error: "internal" }),
  read: vi.fn().mockReturnValue(null),
  save: vi.fn().mockRejectedValue(new Error("commit abort")),
  issue: vi.fn().mockResolvedValue({
    ok: true,
    issued: {
      requestId: "019a0c55-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
      issuedAt: 1761142610602,
      expiresAt: 1761229010602,
    },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../logic/actions", () => ({
  createRoom: mocks.create,
  issueRoomCreation: mocks.issue,
  queryRoomCreation: vi.fn(),
  returnToRoom: vi.fn(),
}));
vi.mock("../logic/room-creation-storage", () => ({
  wasRoomCreationOpened: vi.fn().mockReturnValue(false),
  readRoomCreationIntent: mocks.read,
  saveRoomCreationIntent: mocks.save,
  clearRoomCreationIntent: vi.fn(),
  markRoomCreationSubmitted: vi.fn(),
  saveRoomCreationResult: vi.fn(),
  isRoomCreationSelected: vi.fn().mockResolvedValue(true),
  subscribeRoomCreations: () => () => {},
  listRoomCreationIntents: vi.fn().mockResolvedValue([]),
  notifyRoomCreations: vi.fn(),
}));

import { CreateRoomSection } from "./create-room-section";

it("保存できなくても同じ画面内で作成を試み、失敗後は再試行だけを表示する", async () => {
  render(
    <CreateRoomSection currentUserId="11111111-1111-4111-8111-111111111111" />,
  );
  const button = await screen.findByRole("button", {
    name: "新しいルームを作成",
  });
  await waitFor(() => expect(button).not.toBeDisabled());
  await userEvent.click(button);
  await waitFor(() => expect(mocks.issue).toHaveBeenCalled());
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(await screen.findByRole("status")).not.toHaveTextContent(
    /保存|internal/,
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "もう一度試す" })).toBeEnabled();
});

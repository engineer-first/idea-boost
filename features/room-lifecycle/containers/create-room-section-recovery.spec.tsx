import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
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

it("候補IDを発行しても保存transactionのcommit失敗ならcreateを送らない", async () => {
  render(
    <CreateRoomSection currentUserId="11111111-1111-4111-8111-111111111111" />,
  );
  const button = await screen.findByRole("button", {
    name: "新しいルームを作成",
  });
  await waitFor(() => expect(button).not.toBeDisabled());
  await userEvent.click(button);
  await waitFor(() => expect(mocks.issue).toHaveBeenCalled());
  expect(mocks.create).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("保存");
});

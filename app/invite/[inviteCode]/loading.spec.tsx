// @vitest-environment node
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ InviteLoadingView: vi.fn() }));
vi.mock("@/features/room-lifecycle", () => mocks);

import InviteLoading from "./loading";

it("招待ページの待機中は招待確認中の画面を描画する", () => {
  expect(InviteLoading().type).toBe(mocks.InviteLoadingView);
});

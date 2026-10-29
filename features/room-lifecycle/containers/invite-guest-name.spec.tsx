import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { GuestNameFormProps } from "@/features/auth";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("@/features/auth", () => ({
  GuestNameForm: ({ onPrepared, submitLabel }: GuestNameFormProps) => (
    <button
      type="button"
      onClick={() =>
        onPrepared({
          kind: "guest",
          userId: "11111111-1111-4111-8111-111111111111",
        })
      }
    >
      {submitLabel}
    </button>
  ),
}));

import { InviteGuestName } from "./invite-guest-name";

beforeEach(() => vi.clearAllMocks());

it("ゲスト名の次へ操作で本人準備が完了すると同じ招待URLを再評価する", async () => {
  const user = userEvent.setup();
  render(<InviteGuestName inviteCode="ABC234" />);
  expect(screen.getByText("ABC234")).toBeInTheDocument();
  expect(mocks.refresh).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "次へ" }));
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.push).not.toHaveBeenCalled();
});

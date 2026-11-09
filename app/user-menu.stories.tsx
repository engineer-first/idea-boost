import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { UserMenu } from "./user-menu";

const meta = {
  title: "App/UserMenu",
  component: UserMenu,
  args: { userName: "はな", isHome: true, signOutAction: fn() },
  decorators: [
    (Story) => (
      <div className="flex items-center gap-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UserMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SavedName: Story = {};
export const Unset: Story = { args: { userName: "" } };
export const LongName: Story = { args: { userName: "あ".repeat(40) } };

export const Guest: Story = { args: { sessionKind: "guest" } };

export const Account: Story = { args: { sessionKind: "account" } };
export const NonHomeGuest: Story = {
  args: { isHome: false, sessionKind: "guest" },
};
export const NonHomeAccount: Story = {
  args: { isHome: false, sessionKind: "account" },
};
export const GuestMenuOpen: Story = {
  args: { sessionKind: "guest" },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "ユーザーメニュー" }),
    );
  },
};
export const NonHomeMenuOpen: Story = {
  ...GuestMenuOpen,
  args: { isHome: false, sessionKind: "account" },
};

export const AccountMenuOpen: Story = {
  ...GuestMenuOpen,
  args: { sessionKind: "account" },
};
export const NonHomeGuestMenuOpen: Story = {
  ...GuestMenuOpen,
  args: { isHome: false, sessionKind: "guest" },
};
export const GuestRemovalConfirmation: Story = {
  args: { sessionKind: "guest" },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      body.getByRole("button", { name: "ユーザーメニュー" }),
    );
    await userEvent.click(
      body.getByRole("button", { name: "このブラウザから本人情報を消す" }),
    );
    await waitFor(async () => {
      await expect(
        body.getByRole("alertdialog", { name: "本人情報を消しますか？" }),
      ).toBeVisible();
    });
  },
};

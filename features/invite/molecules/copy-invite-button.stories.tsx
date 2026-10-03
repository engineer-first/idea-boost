import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { CopyInviteButton } from "./copy-invite-button";

function mockClipboard(writeText: (value: string) => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return () => {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
  };
}

const meta = {
  title: "Invite/CopyInviteButton",
  component: CopyInviteButton,
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    value: "https://idea-flow.example/invite/ABC234",
    itemLabel: "招待URL",
  },
} satisfies Meta<typeof CopyInviteButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const InviteCode: Story = {
  args: { value: "ABC234", itemLabel: "招待コード" },
};
export const Copying: Story = {
  beforeEach: () => mockClipboard(() => new Promise<void>(() => undefined)),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "招待URLをコピー" }),
    );
    await expect(
      canvas.getByRole("button", { name: "招待URLをコピー" }),
    ).toBeDisabled();
  },
};
export const Copied: Story = {
  beforeEach: () => mockClipboard(async () => undefined),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "招待URLをコピー" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "招待URLをコピーしました",
    );
  },
};
export const Failed: Story = {
  beforeEach: () =>
    mockClipboard(async () => {
      throw new DOMException("denied", "NotAllowedError");
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "招待URLをコピー" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "招待URLをコピーできませんでした",
    );
  },
};

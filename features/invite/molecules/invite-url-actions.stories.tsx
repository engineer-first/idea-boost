import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { InviteUrlActions } from "./invite-url-actions";

function mockShare(share: Navigator["share"] | undefined) {
  const original = Object.getOwnPropertyDescriptor(navigator, "share");
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  return () => {
    if (original) Object.defineProperty(navigator, "share", original);
    else Reflect.deleteProperty(navigator, "share");
  };
}
const meta = {
  title: "Invite/InviteUrlActions",
  component: InviteUrlActions,
  args: { value: "https://idea-flow.example/invite/ABC234" },
  decorators: [
    (Story) => (
      <div className="w-72 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InviteUrlActions>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Supported: Story = {
  beforeEach: () => mockShare(async () => undefined),
};
export const Unsupported: Story = {
  beforeEach: () => mockShare(undefined),
};
export const Sharing: Story = {
  beforeEach: () => mockShare(() => new Promise<void>(() => undefined)),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "招待URLを共有" }),
    );
    await expect(
      canvas.getByRole("button", { name: "招待URLを共有" }),
    ).toBeDisabled();
  },
};
export const Failed: Story = {
  beforeEach: () =>
    mockShare(async () => {
      throw new DOMException("denied", "NotAllowedError");
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "招待URLを共有" }),
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "共有できませんでした",
    );
  },
};

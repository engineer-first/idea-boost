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
    // 製品では招待URLの全文を出さず、「リンクをコピー」と見せる。
    itemLabel: "招待リンク",
    label: "リンクをコピー",
  },
} satisfies Meta<typeof CopyInviteButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const InviteCode: Story = {
  args: { value: "ABC234", itemLabel: "招待コード", label: undefined },
};
export const Copying: Story = {
  beforeEach: () => mockClipboard(() => new Promise<void>(() => undefined)),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "招待リンクをコピー" }),
    );
    await expect(
      canvas.getByRole("button", { name: "招待リンクをコピー" }),
    ).toBeDisabled();
  },
};
export const Copied: Story = {
  beforeEach: () => mockClipboard(async () => undefined),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "招待リンクをコピー" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "招待リンクをコピーしました",
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
      canvas.getByRole("button", { name: "招待リンクをコピー" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "招待リンクをコピーできませんでした",
    );
  },
};

// 招待文のコピーは、招待コードの見出しの行に置く小さな文字ボタン。
const textArgs = {
  value:
    "Idea Boost のルーム「J05」に招待します。\n参加リンク: https://idea-flow.example/invite/ABC234\n招待コード: ABC234",
  itemLabel: "招待文",
  label: "招待文をコピー",
  appearance: "text",
} as const;
export const TextIdle: Story = { args: textArgs };
export const TextCopied: Story = {
  args: textArgs,
  beforeEach: () => mockClipboard(async () => undefined),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "招待文をコピー" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "招待文をコピーしました",
    );
  },
};
export const TextFailed: Story = {
  args: textArgs,
  beforeEach: () =>
    mockClipboard(async () => {
      throw new DOMException("denied", "NotAllowedError");
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "招待文をコピー" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "招待文をコピーできませんでした",
    );
  },
};

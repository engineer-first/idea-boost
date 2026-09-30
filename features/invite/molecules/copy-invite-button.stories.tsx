import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent } from "storybook/test";
import { CopyInviteButton } from "./copy-invite-button";

const meta = {
  title: "Invite/CopyInviteButton",
  component: CopyInviteButton,
  parameters: {
    layout: "centered",
  },
  args: {
    value: "https://idea-flow.example/invite/ABC234",
    itemLabel: "招待URL",
  },
} satisfies Meta<typeof CopyInviteButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InviteCode: Story = {
  args: {
    value: "ABC234",
    itemLabel: "招待コード",
  },
};

export const CopyDenied: Story = {
  name: "コピー拒否・手動コピー",
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "招待URLをコピー" }),
    );
  },
  beforeEach: () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("denied", "NotAllowedError");
        },
      },
    });
    return () => {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    };
  },
};

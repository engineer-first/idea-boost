import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import {
  buildVerificationActive,
  buildVerificationStatus,
} from "@/contracts/verification.fixture";
import { VerificationView } from "./verification-view";

const meta = {
  title: "Verification/VerificationView",
  component: VerificationView,
  parameters: { layout: "fullscreen" },
  args: {
    active: null,
    status: null,
    pending: false,
    error: null,
    isOwner: true,
    onCreate: fn(),
    onVote: fn(),
    onRetry: fn(),
    outcomesLink: "http://localhost:3000/shared-outcomes#token=example-only",
    outcomesLinkPending: false,
    outcomesLinkError: false,
    roomName: "",
    onRoomNameChange: fn(),
    onOutcome: fn(),
    onOutcomesLink: fn(),
    onRecover: fn(),
  },
} satisfies Meta<typeof VerificationView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Voting: Story = {
  args: {
    active: buildVerificationActive(),
    status: buildVerificationStatus(),
  },
};
export const Preparing: Story = { args: { pending: true } };
export const Failure: Story = {
  args: { error: "検証環境との通信に失敗しました。再取得してください。" },
};
export const Member: Story = {
  args: {
    active: buildVerificationActive(),
    status: buildVerificationStatus({ canCompleteVotes: false }),
    isOwner: false,
  },
};

export const OutcomesLink: Story = {
  args: {
    outcomesLink: "http://localhost:3000/shared-outcomes#token=example-only",
    roomName: "学習会の企画",
  },
};

export const LinkLoading: Story = {
  args: { outcomesLink: null, outcomesLinkPending: true },
};
export const LinkFailure: Story = {
  args: { outcomesLink: null, outcomesLinkError: true },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildSharedOutcome } from "@/contracts/shared-outcomes.fixture";
import { SharedOutcomesView } from "./shared-outcomes-view";

const record = buildSharedOutcome();
const meta = {
  title: "SharedOutcomes/SharedOutcomesView",
  component: SharedOutcomesView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-screen flex-col">
        <Story />
      </div>
    ),
  ],
  args: {
    loading: false,
    error: null,
    detail: null,
    outcomes: [
      record,
      buildSharedOutcome({
        roomId: "123e4567-e89b-42d3-a456-426614174001",
        name: null,
        displayId: "R-9231B2",
      }),
      buildSharedOutcome({
        roomId: "123e4567-e89b-42d3-a456-426614174002",
        displayId: "R-9231B3",
        saveStatus: "failed",
      }),
    ],
    nextCursor: null,
    onOpen: fn(),
    onBack: fn(),
    onRefresh: fn(),
    onMore: fn(),
  },
} satisfies Meta<typeof SharedOutcomesView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const List: Story = {};
export const Detail: Story = { args: { detail: record } };
export const Confirmed: Story = {
  args: { detail: buildSharedOutcome({ status: "confirmed" }) },
};
export const SaveFailed: Story = {
  args: {
    detail: buildSharedOutcome({ status: "confirmed", saveStatus: "failed" }),
  },
};
export const Pending: Story = {
  args: { detail: buildSharedOutcome({ saveStatus: "pending" }) },
};
export const NoSnapshot: Story = {
  args: { detail: buildSharedOutcome({ snapshot: null, lastSavedAt: null }) },
};
export const Empty: Story = { args: { outcomes: [] } };
export const Loading: Story = { args: { outcomes: [], loading: true } };
export const Unavailable: Story = {
  args: {
    outcomes: [],
    error:
      "この秘密リンクでは閲覧できません。管理者へ有効なリンクをご確認ください。",
  },
};

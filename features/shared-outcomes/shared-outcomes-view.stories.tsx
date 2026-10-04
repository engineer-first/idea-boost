import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildSharedOutcome } from "@/contracts/shared-outcomes.fixture";
import { historyArgs } from "./progress-history-view.fixture";
import { DEFAULT_OUTCOME_FILTERS } from "./shared-outcomes-query";
import { SharedOutcomesView } from "./shared-outcomes-view";
import { buildOutcomeList } from "./shared-outcomes-view.fixture";

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
    filters: DEFAULT_OUTCOME_FILTERS,
    onSearch: fn(),
    onRetry: fn(),
    onCopyLink: fn(),
    onAdjacent: fn(),
  },
} satisfies Meta<typeof SharedOutcomesView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const List: Story = {};
export const Detail: Story = { args: { detail: record, history: historyArgs } };
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
    error: "共有成果の閲覧権限がありません。",
  },
};

export const LoadingMore: Story = {
  args: { nextCursor: "50", loadingMore: true },
};
export const RefreshingList: Story = { args: { loading: true } };
export const RetryMore: Story = {
  args: {
    nextCursor: "50",
    paginationError: true,
    error: "次の成果を取得できませんでした。",
    onRetry: fn(),
  },
};
export const NoMatches: Story = {
  args: {
    outcomes: [],
    filters: {
      ...DEFAULT_OUTCOME_FILTERS,
      q: "新サービス",
      status: "confirmed",
    },
    onSearch: fn(),
  },
};
export const SearchContinues: Story = {
  args: { ...NoMatches.args, nextCursor: "250" },
};
export const ManyOutcomes: Story = {
  args: { outcomes: buildOutcomeList(), nextCursor: "60" },
};
export const LongName: Story = {
  args: {
    outcomes: [
      buildSharedOutcome({
        name: "新しいサービスを運営するチームで、参加者の意見を集めながら今後の改善と具体的な取り組みを決めるための振り返り".repeat(
          3,
        ),
      }),
    ],
  },
};
export const DetailUnavailable: Story = {
  args: {
    roomId: record.roomId,
    outcomes: [],
    error: "この成果は存在しないか、保存期間が終了しました。",
    onRetry: fn(),
  },
};

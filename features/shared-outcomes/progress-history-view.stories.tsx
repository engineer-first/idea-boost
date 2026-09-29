import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  buildIdeaMapHistoryRecord,
  buildProgressHistoryRecord,
} from "@/contracts/progress-history.fixture";
import { ProgressHistoryView } from "./progress-history-view";
import { historyArgs } from "./progress-history-view.fixture";

const record = buildProgressHistoryRecord();
const snapshot = record.snapshot;
if (!snapshot) throw new Error("fixture snapshot required");
const meta = {
  title: "SharedOutcomes/ProgressHistoryView",
  component: ProgressHistoryView,
  args: historyArgs,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-5xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProgressHistoryView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Saved: Story = {};
export const Loading: Story = { args: { record: null, recordLoading: true } };
export const Empty: Story = {
  args: { entries: [], selected: null, record: null, nextCursor: null },
};
export const ListLoading: Story = {
  args: {
    entries: [],
    selected: null,
    record: null,
    nextCursor: null,
    loading: true,
  },
};
export const ListError: Story = {
  args: {
    entries: [],
    selected: null,
    record: null,
    nextCursor: null,
    error: "進行の記録を取得できませんでした。",
  },
};
export const FetchError: Story = {
  args: {
    record: null,
    recordError:
      "盤面を取得できませんでした。記録の消失を示すものではありません。",
  },
};
export const EmptyBoard: Story = {
  args: {
    record: buildProgressHistoryRecord({
      snapshot: { ...snapshot, notes: [], groups: [], decisions: [] },
    }),
  },
};
export const Pending: Story = {
  args: {
    selected: buildProgressHistoryRecord({
      saveStatus: "pending",
      reflectedAt: null,
    }),
    record: buildProgressHistoryRecord({
      saveStatus: "pending",
      reflectedAt: null,
      snapshot: null,
    }),
  },
};
export const Failed: Story = {
  args: {
    selected: buildProgressHistoryRecord({
      saveStatus: "failed",
      reflectedAt: null,
    }),
    record: buildProgressHistoryRecord({
      saveStatus: "failed",
      reflectedAt: null,
      snapshot: null,
    }),
  },
};
export const Missing: Story = {
  args: {
    selected: buildProgressHistoryRecord({
      saveStatus: "missing",
      reflectedAt: null,
    }),
    record: buildProgressHistoryRecord({
      saveStatus: "missing",
      reflectedAt: null,
      snapshot: null,
    }),
  },
};
const ideaMapRecord = buildIdeaMapHistoryRecord();
export const IdeaMap: Story = {
  args: {
    entries: [ideaMapRecord],
    nextCursor: null,
    selected: ideaMapRecord,
    record: ideaMapRecord,
  },
};

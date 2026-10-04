import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { SharedOutcomesFilters } from "./shared-outcomes-filters";
import { DEFAULT_OUTCOME_FILTERS } from "./shared-outcomes-query";

const meta = {
  title: "SharedOutcomes/SharedOutcomesFilters",
  component: SharedOutcomesFilters,
  args: { filters: DEFAULT_OUTCOME_FILTERS, onSearch: fn() },
} satisfies Meta<typeof SharedOutcomesFilters>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Filtered: Story = {
  args: {
    filters: {
      ...DEFAULT_OUTCOME_FILTERS,
      q: "新サービス",
      saveStatus: "failed",
    },
  },
};
export const DateRange: Story = {
  args: {
    filters: {
      ...DEFAULT_OUTCOME_FILTERS,
      from: "2026-09-01",
      to: "2026-09-30",
    },
  },
};

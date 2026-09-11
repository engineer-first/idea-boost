import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildCarryover } from "@/contracts/room-protocol.fixture";
import { HmwDecidedIssueBanner } from "./hmw-decided-issue-banner";
import { LONG_DECIDED_ISSUE } from "./hmw-decided-issue-banner.fixture";

const meta = {
  title: "Hmw/HmwDecidedIssueBanner",
  component: HmwDecidedIssueBanner,
  args: {
    content: buildCarryover().content,
  },
} satisfies Meta<typeof HmwDecidedIssueBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// 長文でも省略せず折り返して全文表示されることを確認する。
// 折り返しを見た目で確認できるよう className で幅を制限する。
export const LongContent: Story = {
  args: {
    content: LONG_DECIDED_ISSUE,
    className: "max-w-sm",
  },
};

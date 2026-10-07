import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemberAvatar } from "./member-avatar";
import { MemberSelection } from "./member-selection";

const meta = {
  title: "RoomMembers/MemberSelection",
  component: MemberSelection,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: {
    name: "Hana Sato",
    className: "flex min-h-11 items-center gap-2 p-2",
    onSelect: fn(),
    children: (
      <>
        <MemberAvatar name="Hana Sato" color="blue" />
        <span>Hana Sato</span>
      </>
    ),
  },
} satisfies Meta<typeof MemberSelection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Selectable: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const DisplayOnly: Story = { args: { onSelect: undefined } };

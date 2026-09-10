import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import type { BoardHelpTab } from "../logic/use-board-help";
import { BoardHelpPanel } from "./board-help-panel";

const meta = {
  title: "Room/BoardHelpPanel",
  component: BoardHelpPanel,
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(args.isOpen);
    const [tab, setTab] = useState<BoardHelpTab>(args.tab);
    return (
      <div style={{ height: 600, position: "relative" }}>
        <BoardHelpPanel
          {...args}
          isOpen={isOpen}
          tab={tab}
          onOpenChange={setIsOpen}
          onTabChange={setTab}
        />
      </div>
    );
  },
  args: {
    kind: "idea",
    isOpen: true,
    tab: "write",
    disabled: false,
    onOpenChange: fn(),
    onTabChange: fn(),
    onHmwTemplateSelect: fn(),
    onIdeaHintSelect: fn(),
  },
} satisfies Meta<typeof BoardHelpPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Writing: Story = {};
export const Expansion: Story = { args: { tab: "expand" } };
export const Closed: Story = { args: { isOpen: false } };
export const Hmw: Story = { args: { kind: "hmw" } };
export const Sharing: Story = { args: { kind: "reference", isOpen: false } };
export const Disconnected: Story = { args: { disabled: true } };

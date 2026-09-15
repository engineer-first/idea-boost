import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import type { DemoCheckpoint } from "@/contracts/demo";
import { buildDemoStatus } from "@/contracts/demo.fixture";
import { DemoPanel } from "./demo-panel";
import { DemoPanelView } from "./demo-panel-view";

const meta = {
  title: "Demo/DemoPanel",
  component: DemoPanel,
  args: {
    roomId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    initialStatus: buildDemoStatus(),
  },
  render: function Preview({ initialStatus }) {
    const [expanded, setExpanded] = useState(false);
    const [checkpoint, setCheckpoint] = useState<DemoCheckpoint>(
      initialStatus.checkpoint,
    );
    return (
      <DemoPanelView
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        status={initialStatus}
        pending={false}
        error={null}
        checkpoint={checkpoint}
        onCheckpointChange={setCheckpoint}
        onAction={fn()}
        onCreate={fn()}
        onRetry={fn()}
      />
    );
  },
} satisfies Meta<typeof DemoPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TogglePanel: Story = {};

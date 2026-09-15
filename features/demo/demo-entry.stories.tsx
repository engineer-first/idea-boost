import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import type { DemoCheckpoint } from "@/contracts/demo";
import { DemoEntry } from "./demo-entry";
import { DemoEntryView } from "./demo-entry-view";

const meta = {
  title: "Demo/DemoEntry",
  component: DemoEntry,
  render: function Preview() {
    const [checkpoint, setCheckpoint] = useState<DemoCheckpoint>("start");
    return (
      <DemoEntryView
        checkpoint={checkpoint}
        onCheckpointChange={setCheckpoint}
        pending={false}
        error={null}
        onStart={fn()}
      />
    );
  },
} satisfies Meta<typeof DemoEntry>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SelectCheckpoint: Story = {};

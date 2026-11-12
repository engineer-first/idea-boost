import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { completedRoomFixture } from "@/contracts/completed-rooms.fixture";
import { RoomOutcomeView } from "../molecules/room-outcome-view";
import { OutcomeReflection } from "./outcome-reflection";

const meta = {
  title: "Room/OutcomeReflectionContainer",
  component: OutcomeReflection,
  parameters: { outcomeReflection: true },
  args: { roomId: completedRoomFixture().roomId },
} satisfies Meta<typeof OutcomeReflection>;
export default meta;
export const Default: StoryObj<typeof meta> = {};

const room = completedRoomFixture();
export const OutcomePage: StoryObj<typeof meta> = {
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <div style={{ height: "100dvh" }}>
      <RoomOutcomeView
        authorized
        outcome={{
          issue: room.decisions[0].content,
          hmw: room.decisions[1].content,
          idea: room.decisions[2].content,
        }}
        reflection={<OutcomeReflection {...args} />}
      />
    </div>
  ),
};

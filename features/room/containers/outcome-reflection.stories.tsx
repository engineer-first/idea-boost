import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { completedRoomFixture } from "@/contracts/completed-rooms.fixture";
import { OutcomeReflection } from "./outcome-reflection";

const meta = {
  title: "Room/OutcomeReflectionContainer",
  component: OutcomeReflection,
  args: { roomId: completedRoomFixture().roomId },
} satisfies Meta<typeof OutcomeReflection>;
export default meta;
export const Default: StoryObj<typeof meta> = {};

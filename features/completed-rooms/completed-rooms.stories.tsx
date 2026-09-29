import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CompletedRooms } from "./completed-rooms";

const meta = {
  title: "CompletedRooms/Container",
  component: CompletedRooms,
} satisfies Meta<typeof CompletedRooms>;
export default meta;
export const Default: StoryObj<typeof meta> = {};

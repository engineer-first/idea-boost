import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SharedOutcomes } from "./shared-outcomes";

const meta = {
  title: "SharedOutcomes/SharedOutcomes",
  component: SharedOutcomes,
} satisfies Meta<typeof SharedOutcomes>;
export default meta;
export const Default: StoryObj<typeof meta> = {};

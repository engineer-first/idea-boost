import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { VerificationConsole } from "@/features/verification";
import { startMockWorker, worker } from "./browser";
import { verificationHandlers } from "./verification";

const meta = {
  title: "Verification/VerificationConsole",
  component: VerificationConsole,
  args: { initialActive: null, isOwner: true },
  parameters: { layout: "fullscreen" },
  beforeEach: async () => {
    worker.use(...verificationHandlers());
    await startMockWorker({ quiet: true, onUnhandledFrame: "bypass" });
    return () => worker.resetHandlers();
  },
} satisfies Meta<typeof VerificationConsole>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Interactive: Story = {};

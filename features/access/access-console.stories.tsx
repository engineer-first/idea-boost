import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AccessConsole } from "./access-console";

const meta = {
  title: "Access/AccessConsole",
  component: AccessConsole,
} satisfies Meta<typeof AccessConsole>;
export default meta;
// Browser specが通信を制御して、実containerの再試行・認可失効を確認する。
export const Default: StoryObj<typeof meta> = {};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AccessManagement } from "./access-management";

const meta = {
  title: "Access/AccessManagement",
  component: AccessManagement,
} satisfies Meta<typeof AccessManagement>;
export default meta;
// Browser specで通信を制御し、2種類の閲覧権限を独立して操作する。
export const Default: StoryObj<typeof meta> = {};

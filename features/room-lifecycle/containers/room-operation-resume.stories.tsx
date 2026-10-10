import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RoomOperationResume } from "./room-operation-resume";

const meta = {
  title: "RoomLifecycle/RoomOperationResume",
  component: RoomOperationResume,
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof RoomOperationResume>;
export default meta;
export const Checking: StoryObj<typeof meta> = {};

export const AccountChanged: StoryObj<typeof meta> = {
  args: { initialError: "account_changed" },
};
export const LoginFailed: StoryObj<typeof meta> = {
  args: { initialError: "login_failed" },
};

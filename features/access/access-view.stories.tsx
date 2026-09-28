import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AccessView } from "./access-view";

const meta = {
  title: "Access/AccessView",
  component: AccessView,
  args: {
    users: [{ id: "1", name: "Owner", email: "owner@example.test" }],
    email: "",
    loading: false,
    pending: false,
    error: null,
    onEmailChange: () => {},
    onAdd: () => {},
    onRemove: () => {},
    onRetry: () => {},
  },
} satisfies Meta<typeof AccessView>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
export const Empty: StoryObj<typeof meta> = { args: { users: [] } };
export const Failed: StoryObj<typeof meta> = {
  args: { error: "閲覧者を取得できませんでした。" },
};

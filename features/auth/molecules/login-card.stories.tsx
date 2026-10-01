import type { Meta, StoryObj } from "@storybook/react";
import { LoginCard } from "./login-card";

const meta: Meta<typeof LoginCard> = {
  title: "Auth/LoginCard",
  component: LoginCard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="flex h-screen flex-col">
        <Story />
      </div>
    ),
  ],
  args: {
    googleAction: async () => {},
    passwordAction: async () => ({}),
  },
};

export default meta;
type Story = StoryObj<typeof LoginCard>;

export const Default: Story = {
  args: {
    isConfigured: true,
    showDevAuth: false,
  },
};

export const WithError: Story = {
  args: {
    isConfigured: true,
    showDevAuth: false,
    error: "Google認証中にエラーが発生しました。もう一度お試しください。",
  },
};

export const DevAuth: Story = {
  args: {
    isConfigured: true,
    showDevAuth: true,
  },
};

export const RetryDevAuth: Story = {
  args: {
    isConfigured: true,
    showDevAuth: true,
    passwordAction: async () => ({
      error: "メールアドレスまたはパスワードが違います。",
    }),
  },
};

export const NotConfigured: Story = {
  args: {
    isConfigured: false,
    showDevAuth: false,
  },
};

export const PendingDevAuth: Story = {
  args: {
    isConfigured: true,
    showDevAuth: true,
    passwordAction: async () => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return { error: "ユーザー情報の同期に失敗しました。" };
    },
  },
};

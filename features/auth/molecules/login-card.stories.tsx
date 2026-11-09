import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, userEvent, within } from "storybook/test";
import { guestIdentityFailure } from "../logic/guest-identity-copy";
import { guestStartLabel } from "../logic/login-copy";
import {
  GuestNameFormView,
  type GuestNameFormViewProps,
} from "./guest-name-form-view";
import { LoginCard } from "./login-card";

const formProps: GuestNameFormViewProps = {
  name: "",
  pending: false,
  error: null,
  onNameChange: fn(),
  onSubmit: fn(),
};

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
    guestForm: <GuestNameFormView {...formProps} />,
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

export const FromInvite: Story = {
  args: { aboutHref: "/about?next=%2Finvite%2FABC123" },
};

export const GuestName: Story = {
  name: "ゲスト名・入力前",
  args: { isConfigured: true, showDevAuth: false },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: guestStartLabel }),
    );
  },
};
export const GuestNamePending: Story = {
  ...GuestName,
  name: "ゲスト名・送信中",
  args: {
    ...GuestName.args,
    guestPending: true,
    guestForm: <GuestNameFormView {...formProps} name="はな" pending />,
  },
};
export const GuestNameError: Story = {
  ...GuestName,
  name: "ゲスト名・失敗",
  args: {
    ...GuestName.args,
    guestForm: (
      <GuestNameFormView
        {...formProps}
        name="はな"
        error={guestIdentityFailure}
      />
    ),
  },
};

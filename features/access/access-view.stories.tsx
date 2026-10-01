import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useArgs } from "storybook/preview-api";
import { AccessDeniedView, AccessView } from "./access-view";

const meta = {
  title: "Access/AccessView",
  component: AccessView,
  render: function Interactive(args) {
    const [, updateArgs] = useArgs();
    return (
      <AccessView {...args} onEmailChange={(email) => updateArgs({ email })} />
    );
  },
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
  args: {
    error:
      "閲覧者一覧を取得できませんでした。最新の権限を確認するには再試行してください。",
  },
};
export const InitialFetchFailed: StoryObj<typeof meta> = {
  args: {
    users: [],
    error:
      "閲覧者一覧を取得できませんでした。最新の権限を確認するには再試行してください。",
  },
};
export const Loading: StoryObj<typeof meta> = {
  args: { users: [], loading: true },
};
export const Pending: StoryObj<typeof meta> = {
  args: { email: "member@example.test", pending: true },
};
export const AddFailed: StoryObj<typeof meta> = {
  args: {
    email: "member@example.test",
    error:
      "member@example.test の閲覧権限を追加できませんでした。通信を確認して再試行してください。",
  },
};
export const RemoveFailed: StoryObj<typeof meta> = {
  args: {
    error:
      "owner@example.test の閲覧権限を取消できませんでした。通信を確認して再試行してください。",
  },
};
export const RefreshAfterAddFailed: StoryObj<typeof meta> = {
  args: {
    error:
      "member@example.test の閲覧権限の追加は完了しました。一覧を取得できなかったため、再試行して最新の権限を確認してください。",
  },
};
export const LongIdentity: StoryObj<typeof meta> = {
  args: {
    users: [
      {
        id: "long",
        name: "VeryLongRegisteredReaderNameWithoutSpacesForLayoutVerification",
        email: "long.registered.reader.name@example.test",
      },
    ],
  },
};
export const PermissionDenied: StoryObj<typeof meta> = {
  render: () => (
    <AccessDeniedView
      unauthenticated={false}
      error="成果閲覧者の管理権限がありません。権限を確認してから再試行してください。"
      loading={false}
      onRetry={() => {}}
    />
  ),
};
export const SessionExpired: StoryObj<typeof meta> = {
  render: () => (
    <AccessDeniedView
      unauthenticated
      error="ログイン状態を確認できません。もう一度ログインしてください。"
      loading={false}
      onRetry={() => {}}
    />
  ),
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import {
  CreateRoomSectionView,
  type CreateRoomSectionViewProps,
} from "./create-room-section-view";

const meta = {
  title: "RoomLifecycle/CreateRoomSection",
  component: CreateRoomSectionView,
  parameters: { layout: "padded" },
  args: {
    pending: false,
    onSubmit: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CreateRoomSectionView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Pending: Story = {
  args: {
    pending: true,
  },
};

export const AllStates: Story = {
  render: () => {
    const states: { label: string; props: CreateRoomSectionViewProps }[] = [
      { label: "Default", props: { pending: false, onSubmit: fn() } },
      { label: "Pending", props: { pending: true, onSubmit: fn() } },
    ];
    return (
      <div className="flex w-[320px] flex-col gap-8">
        {states.map(({ label, props }) => (
          <div key={label} className="flex flex-col gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {label}
            </span>
            <CreateRoomSectionView {...props} />
          </div>
        ))}
      </div>
    );
  },
};

export const Unknown: Story = {
  args: {
    recovering: true,
    intentName: "サービスの相談",
    message: "作成結果を確認できません。同じ作成を確認・再試行してください。",
    onNewIntent: fn(),
  },
};
export const StorageError: Story = {
  args: {
    storageError: true,
    message:
      "作成要求の記録を読み取れません。ブラウザの保存設定を確認して再読み込みしてください。",
  },
};

export const Prepared: Story = {
  args: {
    recovering: true,
    recoveryState: "prepared",
    intentName: "午後チーム",
    issuedAt: 1791279000000,
    onNewIntent: fn(),
  },
};
export const Known: Story = {
  args: { recovering: true, recoveryState: "known", onNewIntent: fn() },
};
export const Expired: Story = {
  args: {
    recovering: true,
    recoveryState: "expired",
    message:
      "作成を再試行できる24時間が過ぎました。既に作成された可能性があるため、結果の確認は続けられます。",
    onNewIntent: fn(),
  },
};
export const ActorMismatch: Story = {
  args: {
    recovering: true,
    recoveryState: "actor_mismatch",
    intentName: "午前チーム",
    message: "アカウントが変わりました。ログイン状態を確認してください。",
    onNewIntent: fn(),
  },
};
export const SeparateIntent: Story = {
  args: {
    savedIntents: [
      {
        requestId: "11111111-1111-4111-8111-111111111111",
        name: "午前チーム",
        state: "submitted",
      },
    ],
    onSelectIntent: fn(),
  },
};

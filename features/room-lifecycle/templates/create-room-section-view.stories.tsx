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
    message: "ルームへの移動を完了できませんでした。もう一度お試しください。",
    onNewIntent: fn(),
  },
};
export const StorageError: Story = {
  args: {
    storageError: true,
    message:
      "このブラウザで作成を続けられません。保存設定を確認して再読み込みしてください。",
  },
};

export const Prepared: Story = {
  args: {
    recovering: true,
    recoveryState: "prepared",
    intentName: "午後チーム",
    onNewIntent: fn(),
  },
};
export const Known: Story = {
  args: { recovering: false, recoveryState: "known" },
};
export const Expired: Story = {
  args: {
    recovering: false,
    requiresNewConfirmation: true,
    onRecover: fn(),
    recoveryState: "expired",
    message:
      "前のルームを開けませんでした。新しいルームを作成するか、もう一度探してください。",
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
  args: { requiresNewConfirmation: true, onRecover: fn() },
};

export const ConfirmNew: Story = {
  args: { requiresNewConfirmation: true, onRecover: fn() },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "新しいルームを作成" }),
    );
  },
};

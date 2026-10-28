import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { GUEST_IDENTITY_UNAVAILABLE_ACTION_MESSAGE } from "../logic/guest-identity-message";
import {
  GuestNameFormView,
  type GuestNameFormViewProps,
  guestIdentityFailure,
} from "@/features/auth";
import {
  CreateRoomSectionView,
  type CreateRoomSectionViewProps,
} from "./create-room-section-view";

const guestNameProps: GuestNameFormViewProps = {
  name: "はな",
  pending: false,
  error: null,
  submitLabel: "次へ",
  onNameChange: fn(),
  onSubmit: fn(),
};
const identityStates: { label: string; props: CreateRoomSectionViewProps }[] = [
  {
    label: "名前入力（未準備）",
    props: { identityStep: <GuestNameFormView {...guestNameProps} name="" /> },
  },
  {
    label: "名前送信中",
    props: { identityStep: <GuestNameFormView {...guestNameProps} pending /> },
  },
  {
    label: "名前の登録失敗",
    props: {
      identityStep: (
        <GuestNameFormView {...guestNameProps} error={guestIdentityFailure} />
      ),
    },
  },
];

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
      ...identityStates,
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

export const CreatingPreparedIntent: Story = {
  args: {
    pending: true,
    recovering: true,
    recoveryState: "prepared",
    intentName: "サービスの相談",
    onNewIntent: fn(),
  },
};

export const IdentityUnprepared: Story = {
  name: "名前入力（未準備）",
  args: { identityStep: identityStates[0].props.identityStep },
};
export const IdentityPending: Story = {
  name: "名前送信中",
  args: { identityStep: identityStates[1].props.identityStep },
};
export const IdentityFailed: Story = {
  name: "名前の登録失敗",
  args: { identityStep: identityStates[2].props.identityStep },
};

export const IdentityUnavailable: Story = {
  args: {
    message: GUEST_IDENTITY_UNAVAILABLE_ACTION_MESSAGE,
  },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import {
  JoinRoomSectionView,
  type JoinRoomSectionViewProps,
} from "./join-room-section-view";

const baseArgs: JoinRoomSectionViewProps = {
  code: "",
  onCodeChange: fn(),
  onCodeBlur: fn(),
  lookingUp: false,
  joining: false,
  dialogOpen: false,
  onDialogOpenChange: fn(),
  hostName: "",
  onSubmit: fn((event: React.FormEvent) => {
    event.preventDefault();
  }),
  onConfirm: fn(),
};

const meta = {
  title: "RoomLifecycle/JoinRoomSection",
  component: JoinRoomSectionView,
  parameters: { layout: "padded" },
  args: baseArgs,
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof JoinRoomSectionView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { code: "" },
};

export const IncompleteCode: Story = {
  args: { code: "AB12" },
};

export const InvalidCode: Story = {
  args: { code: "AB12", codeError: "英数字6桁で入力してください。" },
};

export const ValidCode: Story = {
  args: { code: "AB12CD" },
};

export const LookingUp: Story = {
  args: { code: "AB12CD", lookingUp: true },
};

export const ConfirmDialog: Story = {
  args: {
    code: "AB12CD",
    hostName: "田中太郎",
    dialogOpen: true,
  },
};

export const ConfirmDialogWithoutHost: Story = {
  args: {
    code: "AB12CD",
    hostName: "",
    dialogOpen: true,
  },
};

export const Joining: Story = {
  args: {
    code: "AB12CD",
    hostName: "田中太郎",
    dialogOpen: true,
    joining: true,
  },
};

export const AllStates: Story = {
  render: () => {
    const states: { label: string; props: JoinRoomSectionViewProps }[] = [
      { label: "Empty", props: { ...baseArgs, code: "" } },
      { label: "IncompleteCode", props: { ...baseArgs, code: "AB12" } },
      {
        label: "InvalidCode",
        props: {
          ...baseArgs,
          code: "AB12",
          codeError: "英数字6桁で入力してください。",
        },
      },
      { label: "ValidCode", props: { ...baseArgs, code: "AB12CD" } },
      {
        label: "LookingUp",
        props: { ...baseArgs, code: "AB12CD", lookingUp: true },
      },
    ];
    return (
      <div className="flex w-[320px] flex-col gap-8">
        {states.map(({ label, props }) => (
          <div key={label} className="flex flex-col gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {label}
            </span>
            <JoinRoomSectionView {...props} />
          </div>
        ))}
      </div>
    );
  },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { inviteCopy } from "../logic/invite-copy";
import {
  JoinRoomSectionView,
  type JoinRoomSectionViewProps,
} from "./join-room-section-view";

const baseArgs: JoinRoomSectionViewProps = {
  code: "",
  canSubmit: false,
  onCodeChange: fn(),
  onCodeBlur: fn(),
  moving: false,
  onSubmit: fn((event: React.FormEvent) => {
    event.preventDefault();
  }),
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
  args: { code: "AB12", codeError: inviteCopy.codeError },
};

export const ValidCode: Story = {
  args: { code: "AB12CD", canSubmit: true },
};

export const Moving: Story = {
  args: { code: "AB12CD", canSubmit: true, moving: true },
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
          codeError: inviteCopy.codeError,
        },
      },
      {
        label: "ValidCode",
        props: { ...baseArgs, code: "AB12CD", canSubmit: true },
      },
      {
        label: "Moving",
        props: { ...baseArgs, code: "AB12CD", canSubmit: true, moving: true },
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

export const IdentityUnavailable: Story = {
  args: {
    dialogOpen: true,
    code: "AB12CD",
    message:
      "このブラウザでは、以前の参加者として確認できませんでした。新しく始めると別の参加者になり、以前のホスト権限・付箋・投票は引き継がれません。",
  },
};

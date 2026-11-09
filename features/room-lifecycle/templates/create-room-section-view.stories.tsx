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
      {
        label: "Failure",
        props: {
          message: "ルームを開けませんでした。もう一度お試しください。",
          onSubmit: fn(),
        },
      },
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

export const Failure: Story = {
  args: {
    intentName: "サービスの相談",
    message: "ルームを開けませんでした。もう一度お試しください。",
  },
};

export const TooLong: Story = { args: { intentName: "あ".repeat(16) } };

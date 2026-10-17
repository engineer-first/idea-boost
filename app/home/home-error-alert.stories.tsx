import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { HomeErrorAlert } from "./home-error-alert";

const meta = {
  title: "Home/HomeErrorAlert",
  component: HomeErrorAlert,
  parameters: { layout: "padded" },
  args: {
    message: "ルームを作成できませんでした。",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HomeErrorAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

// 作成失敗。
export const CreateFailed: Story = {
  args: { message: "ルームを作成できませんでした。" },
};

// 参加失敗（ルームなし）。
export const JoinNotFound: Story = {
  args: {
    message:
      "参加できるルームが見つかりません。ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。",
  },
};

export const RoomClosed: Story = {
  args: {
    message:
      "このルームは終了しているため参加できません。新しい招待コードをホストに確認してください。",
  },
};

export const RoomFull: Story = {
  args: {
    message:
      "ルームが満員（上限20人）のため参加できません。ホストに確認してください。",
  },
};

// 招待コード形式不正。
export const InvalidInviteCode: Story = {
  args: { message: "招待コードは英数字6桁で入力してください。" },
};

// サービス一時障害。
export const ServiceUnavailable: Story = {
  args: {
    message:
      "ルーム情報を取得できませんでした。しばらくしてから再度お試しください。",
  },
};

// 全状態の一覧（公開Storybookのカタログ用）。
export const AllStates: Story = {
  render: () => (
    <div className="flex w-[360px] flex-col gap-6">
      {(
        [
          ["作成失敗", "ルームを作成できませんでした。"],
          [
            "参加失敗",
            "参加できるルームが見つかりません。ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。",
          ],
          ["形式不正", "招待コードは英数字6桁で入力してください。"],
          [
            "サービス障害",
            "ルーム情報を取得できませんでした。しばらくしてから再度お試しください。",
          ],
        ] as const
      ).map(([label, message]) => (
        <div key={label} className="flex flex-col gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {label}
          </span>
          <HomeErrorAlert message={message} />
        </div>
      ))}
    </div>
  ),
};

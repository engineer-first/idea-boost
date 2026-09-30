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

// 参加可能なルームを確認できない（終了・不存在は断定しない）。
export const JoinNotFound: Story = {
  args: {
    message:
      "この招待で参加できるルームを確認できませんでした。招待コードを確認し、招待した人に現在使える招待を確認してください。",
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

// 全状態の一覧（VRT / カタログ用）。
export const AllStates: Story = {
  render: () => (
    <div className="flex w-[360px] flex-col gap-6">
      {(
        [
          ["作成失敗", "ルームを作成できませんでした。"],
          [
            "参加失敗",
            "この招待で参加できるルームを確認できませんでした。招待コードを確認し、招待した人に現在使える招待を確認してください。",
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

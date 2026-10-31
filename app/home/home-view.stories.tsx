import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import {
  CreateRoomSectionView,
  JoinRoomSectionView,
} from "@/features/room-lifecycle";
import {
  clearLastRoom,
  rememberLastRoom,
} from "@/lib/room-client/last-room-storage";
import { HomeErrorAlert } from "./home-error-alert";
import { HomeView } from "./home-view";

const meta = {
  title: "Home/HomeView",
  component: HomeView,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "AccountLinkSection は container をそのまま描画するため、連携ボタンを押すと実際の Server Action を呼びます。操作は Auth/AccountLinkSection で確認してください。",
      },
    },
  },
  args: {
    currentUserId: "11111111-1111-4111-8111-111111111111",
    accountLinkStatus: "guest",
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

// ログイン済みの通常状態（error なし）。
export const Default: Story = {};

// 作成失敗など、query 経由の error。
export const WithCreateError: Story = {
  args: {
    error: "ルームを作成できませんでした。",
  },
};

// 参加失敗。
export const WithJoinError: Story = {
  args: {
    error:
      "参加できるルームが見つかりません。ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。",
  },
};

// 招待コード形式不正。
export const WithInvalidCodeError: Story = {
  args: {
    error: "招待コードは英数字6桁で入力してください。",
  },
};

// 全状態の一覧（エラー有無のカタログ）。
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-10 p-4">
      {(
        [
          ["Default", undefined],
          ["Recovering", undefined],
          ["WithCreateError", "ルームを作成できませんでした。"],
          [
            "WithJoinError",
            "参加できるルームが見つかりません。ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。",
          ],
          ["WithInvalidCodeError", "招待コードは英数字6桁で入力してください。"],
        ] as const
      ).map(([label, error]) => (
        <div key={label} className="flex flex-col gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {label}
          </span>
          <div className="min-h-[520px] overflow-hidden rounded-xl border border-border">
            {/* HomeView は Server Action 付き子を含むため、見た目カタログは View 合成 */}
            <div className="relative flex min-h-[520px] items-center justify-center overflow-hidden bg-muted/40 p-6">
              <div className="relative z-10 flex w-full max-w-2xl flex-col gap-6">
                <header className="space-y-2 text-center">
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    アイデア出しを始めましょう
                  </h1>
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    新しいルームを作成するか、招待コードを入力して参加できます。
                  </p>
                </header>
                {error ? <HomeErrorAlert message={error} /> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <CreateRoomSectionView
                    pending={false}
                    onSubmit={fn()}
                    recovering={label === "Recovering"}
                    intentName={
                      label === "Recovering" ? "サービスの相談" : undefined
                    }
                  />
                  <JoinRoomSectionView
                    canSubmit={false}
                    code=""
                    onCodeChange={fn()}
                    onSubmit={fn()}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  ),
};

export const WithReturnRoom: Story = {
  beforeEach: () => {
    rememberLastRoom(
      "11111111-1111-4111-8111-111111111111",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    return () => clearLastRoom();
  },
};

export const Guest: Story = {
  name: "ゲスト（任意のGoogle連携）",
  args: { accountLinkStatus: "guest" },
};
export const Account: Story = {
  name: "Google連携済み",
  args: { accountLinkStatus: "linked" },
};
export const AccountLinkConflict: Story = {
  name: "別の記録で使用中のGoogleアカウント",
  args: {
    accountLinkStatus: "guest",
    accountLinkResult: "google_account_in_use",
  },
};
export const AccountLinkSuccess: Story = {
  name: "Google連携完了",
  args: { accountLinkStatus: "linked", accountLinkResult: "linked" },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { completedRoomFixture } from "@/contracts/completed-rooms.fixture";
import { CompletedRoomsView } from "@/features/completed-rooms";
import {
  CreateRoomSectionView,
  JoinRoomSectionView,
} from "@/features/room-lifecycle";
import { HomeErrorAlert } from "./home-error-alert";
import { HomeView } from "./home-view";

const meta = {
  title: "Home/HomeView",
  component: HomeView,
  parameters: { layout: "fullscreen" },
  args: {},
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
    error: "ルームが見つかりませんでした。",
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
          ["WithCreateError", "ルームを作成できませんでした。"],
          ["WithJoinError", "ルームが見つかりませんでした。"],
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
                  <CreateRoomSectionView pending={false} onSubmit={fn()} />
                  <JoinRoomSectionView
                    code=""
                    onCodeChange={fn()}
                    dialogOpen={false}
                    onDialogOpenChange={fn()}
                    hostName=""
                    onSubmit={fn()}
                    onConfirm={fn()}
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

const historyArgs = {
  embedded: true,
  rooms: [completedRoomFixture()],
  loading: false,
  error: null,
  hasMore: false,
  onRefresh: fn(),
  onRetry: fn(),
  onMore: fn(),
};
const showHistory: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  canvasElement.querySelector("summary")?.click();
};
export const HistorySuccess: Story = {
  args: { completedRooms: <CompletedRoomsView {...historyArgs} /> },
  play: showHistory,
};
export const HistoryEmpty: Story = {
  args: { completedRooms: <CompletedRoomsView {...historyArgs} rooms={[]} /> },
  play: showHistory,
};
export const HistoryLoading: Story = {
  args: {
    completedRooms: <CompletedRoomsView {...historyArgs} rooms={[]} loading />,
  },
  play: showHistory,
};
export const HistoryError: Story = {
  args: {
    completedRooms: (
      <CompletedRoomsView
        {...historyArgs}
        rooms={[]}
        error="以前のルームを取得できませんでした。再取得をお試しください。"
      />
    ),
  },
  play: showHistory,
};
export const HistoryManyRooms: Story = {
  args: {
    completedRooms: (
      <CompletedRoomsView
        {...historyArgs}
        hasMore
        rooms={Array.from({ length: 30 }, (_, index) =>
          completedRoomFixture({
            roomId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
            idea: `${index + 1}件目：${"授業で考えた長いアイデア".repeat(30)}`,
          }),
        )}
      />
    ),
  },
  play: showHistory,
};

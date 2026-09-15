import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildLobbyPhase } from "@/contracts/phase.fixture";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { ROOM_MEMBERS_MAX_VISIBLE } from "@/features/room-members";
import { RoomLobbyView, type RoomLobbyViewProps } from "./room-lobby-view";

const ME = "11111111-1111-4111-8111-111111111111";
const LOBBY_PHASE = buildLobbyPhase();

const baseArgs: RoomLobbyViewProps = {
  members: buildMembers(3, ME),
  currentUserId: ME,
  isHost: true,
  hostUserId: ME,
  phase: LOBBY_PHASE,
  inviteCode: "AB12CD",
  inviteUrl: "https://idea-flow.example/invite/AB12CD",
  connectionStatus: "open",
  isStarting: false,
  onStart: fn(),
  onLeave: fn(),
  isLeaving: false,
};

const meta = {
  title: "Room/RoomLobbyView",
  component: RoomLobbyView,
  parameters: { layout: "fullscreen" },
  args: baseArgs,
  decorators: [
    (Story) => (
      <div style={{ height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomLobbyView>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// ホスト
// ---------------------------------------------------------------------------

export const HostSolo: Story = {
  name: "ホスト・1 人",
  args: { isHost: true, members: buildMembers(1, ME) },
};

export const HostSix: Story = {
  name: "ホスト・6 人",
  args: { isHost: true, members: buildMembers(6, ME) },
};

// ---------------------------------------------------------------------------
// 参加者（ゲスト）
// ---------------------------------------------------------------------------

export const GuestTwo: Story = {
  name: "参加者・2 人",
  args: { isHost: false, members: buildMembers(2, ME) },
};

export const GuestSix: Story = {
  name: "参加者・6 人",
  args: { isHost: false, members: buildMembers(6, ME) },
};

// ---------------------------------------------------------------------------
// 処理中・接続
// ---------------------------------------------------------------------------

export const Starting: Story = {
  name: "開始処理中",
  args: { isStarting: true },
};

export const Connecting: Story = {
  name: "接続中",
  args: { connectionStatus: "connecting" },
};

export const Reconnecting: Story = {
  name: "再接続中",
  args: { connectionStatus: "closed" },
};

export const Leaving: Story = {
  name: "解散処理中",
  args: { isLeaving: true },
};

// ---------------------------------------------------------------------------
// カタログ（状態網羅）
// ---------------------------------------------------------------------------

export const AllParticipationStates: Story = {
  name: "一覧: 参加人数",
  render: () => {
    const states: { label: string; count: number; isHost?: boolean }[] = [
      { label: "ホスト・1 人", count: 1 },
      { label: "ホスト・3 人", count: 3 },
      { label: "ホスト・6 人", count: 6 },
      { label: "ホスト・12 人（4×3 上限）", count: ROOM_MEMBERS_MAX_VISIBLE },
      { label: "ホスト・15 人（+N）", count: 15 },
      { label: "参加者・2 人", count: 2, isHost: false },
      { label: "参加者・6 人", count: 6, isHost: false },
      { label: "参加者・15 人", count: 15, isHost: false },
    ];
    return (
      <div className="flex flex-col gap-10 p-4">
        {states.map(({ label, count, isHost = true }) => (
          <div key={label} className="flex flex-col gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {label}
            </span>
            <div className="min-h-[640px] overflow-hidden rounded-xl border border-border">
              <RoomLobbyView
                {...baseArgs}
                members={buildMembers(count, ME)}
                isHost={isHost}
              />
            </div>
          </div>
        ))}
      </div>
    );
  },
};

export const AllInteractionStates: Story = {
  name: "一覧: 役割・接続",
  render: () => {
    const states: { label: string; props: Partial<RoomLobbyViewProps> }[] = [
      { label: "Host", props: { isHost: true } },
      { label: "Guest", props: { isHost: false } },
      { label: "Starting", props: { isStarting: true } },
      { label: "Connecting", props: { connectionStatus: "connecting" } },
      { label: "Reconnecting", props: { connectionStatus: "closed" } },
      { label: "Leaving", props: { isLeaving: true } },
    ];
    return (
      <div className="flex flex-col gap-10 p-4">
        {states.map(({ label, props }) => (
          <div key={label} className="flex flex-col gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {label}
            </span>
            <div className="min-h-[640px] overflow-hidden rounded-xl border border-border">
              <RoomLobbyView {...baseArgs} {...props} />
            </div>
          </div>
        ))}
      </div>
    );
  },
};

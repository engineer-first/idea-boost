import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildLobbyPhase } from "@/contracts/phase.fixture";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { buildRoomNameControls } from "../logic/room-name.fixture";
import { buildLobbyMembers } from "../organisms/lobby-members.fixture";
import { RoomLobbyView, type RoomLobbyViewProps } from "./room-lobby-view";

const ME = "11111111-1111-4111-8111-111111111111";
const LOBBY_PHASE = buildLobbyPhase();

const avatarControls = {
  pending: false,
  disabled: false,
  unavailable: false,
  error: null,
  randomize: fn(),
};

const baseArgs: RoomLobbyViewProps = {
  roomName: buildRoomNameControls(),
  avatarChange: avatarControls,
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
  onTransferHost: fn(),
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
      { label: "ホスト・12 人", count: 12 },
      { label: "ホスト・20 人", count: 20 },
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

export const DelayedConnection: Story = {
  args: { connectionStatus: "closed", connectionDelayed: true },
};

export const Connected: Story = { args: { connectionStatus: "open" } };

export const AuthRequired: Story = {
  args: { connectionStatus: "auth-required" },
};

export const Unavailable: Story = {
  args: { connectionStatus: "unavailable" },
};

export const DelayedConnecting: Story = {
  args: { connectionStatus: "connecting", connectionDelayed: true },
};

export const DelayedReconnecting: Story = {
  args: { connectionStatus: "reconnecting", connectionDelayed: true },
};

export const UnnamedRoom: Story = {
  args: { roomName: buildRoomNameControls({ name: null, draft: "" }) },
};

export const AvatarUnavailable: Story = {
  name: "顔の変更先なし",
  args: {
    avatarChange: {
      pending: false,
      disabled: true,
      unavailable: true,
      error: null,
      randomize: fn(),
    },
  },
};
export const MemberDisconnected: Story = {
  name: "参加者が通信切断中",
  args: { connectedUserIds: [ME] },
};
export const AvatarChanging: Story = {
  name: "顔を変更中",
  args: {
    avatarChange: {
      pending: true,
      disabled: true,
      unavailable: false,
      error: null,
      randomize: fn(),
    },
  },
};

export const HostFour: Story = {
  name: "円卓風・4人",
  args: {
    members: buildLobbyMembers(4, ME),
    roomName: buildRoomNameControls({ name: "チームのアイデア会議" }),
    displayName: {
      open: false,
      draft: "はな",
      pending: false,
      error: null,
      disabled: false,
      request: fn(),
      onDraftChange: fn(),
      onOpenChange: fn(),
      onConfirm: fn(),
    },
  },
};

export const HostTwenty: Story = {
  name: "最大20人・変更先なし",
  args: {
    ...HostFour.args,
    members: buildLobbyMembers(20, ME),
    avatarChange: {
      ...avatarControls,
      disabled: true,
      unavailable: true,
    },
  },
};

export const BackgroundSolo: Story = {
  name: "背景・1人",
  args: {
    ...HostFour.args,
    roomName: buildRoomNameControls({ name: null }),
    members: [
      { ...buildLobbyMembers(1, ME)[0], name: "りおまる", avatarId: "face-04" },
    ],
  },
};

export const LongNames: Story = {
  name: "20人・長い同名と通信切断",
  args: {
    ...HostTwenty.args,
    members: buildLobbyMembers(20, ME).map((member) => ({
      ...member,
      name: "アイデアを考えているメンバー",
    })),
    connectedUserIds: [ME],
  },
};

export const AvatarError: Story = {
  name: "顔の変更に失敗",
  args: {
    ...HostFour.args,
    avatarChange: {
      ...avatarControls,
      error: "送信できませんでした。もう一度お試しください。",
    },
  },
};

export const Empty: Story = { args: { members: [] } };

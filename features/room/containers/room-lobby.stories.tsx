import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useMemo } from "react";
import {
  createRoomConnectionPreview,
  OVERFLOW_PREVIEW_MEMBERS,
  PREVIEW_MEMBERS,
  PREVIEW_SELF,
  type RoomPreviewMode,
} from "../logic/room-connection-preview.fixture";
import { RoomLobby } from "./room-lobby";

function RoomConnectionPreview({
  mode,
  overflow = false,
  connectionDelayMs = 0,
}: {
  mode: RoomPreviewMode;
  overflow?: boolean;
  connectionDelayMs?: number;
}) {
  const members = overflow ? OVERFLOW_PREVIEW_MEMBERS : PREVIEW_MEMBERS;
  const server = useMemo(
    () => createRoomConnectionPreview(mode, { members, connectionDelayMs }),
    [mode, members, connectionDelayMs],
  );
  useEffect(() => {
    const listener = (event: Event) => {
      const kind = (event as CustomEvent<unknown>).detail;
      if (kind === "recipient-left") server.serverEvent(kind);
    };
    window.addEventListener("room-connection-preview", listener);
    return () =>
      window.removeEventListener("room-connection-preview", listener);
  }, [server]);
  return (
    <div style={{ height: "100dvh" }}>
      <RoomLobby
        roomId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        inviteCode="ABC234"
        inviteUrl="https://example.test/invite/ABC234"
        currentUserId={PREVIEW_SELF}
        initialPhase={{ kind: "lobby" }}
        initialMembers={members}
        webSocketFactory={server.factory}
        saveDisplayNameAction={server.saveDisplayName}
      />
    </div>
  );
}
const meta = {
  title: "Room/RoomConnectionFlow",
  component: RoomConnectionPreview,
  parameters: { layout: "fullscreen", activeRoomConnection: true },
  args: { mode: "success" },
} satisfies Meta<typeof RoomConnectionPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Success: Story = {};
export const Refused: Story = { args: { mode: "refused" } };
export const Reconnect: Story = { args: { mode: "reconnect" } };
export const OverflowSelf: Story = { args: { overflow: true } };

export const Loading: Story = { args: { connectionDelayMs: 15000 } };

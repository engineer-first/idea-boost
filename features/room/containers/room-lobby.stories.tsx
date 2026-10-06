import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useMemo } from "react";
import {
  createHostTransferPreview,
  type HostPreviewMode,
  OVERFLOW_PREVIEW_MEMBERS,
  PREVIEW_HOST,
  PREVIEW_MEMBERS,
} from "../logic/host-transfer-preview.fixture";
import { RoomLobby } from "./room-lobby";

function HostTransferPreview({
  mode,
  overflow = false,
}: {
  mode: HostPreviewMode;
  overflow?: boolean;
}) {
  const members = overflow ? OVERFLOW_PREVIEW_MEMBERS : PREVIEW_MEMBERS;
  const server = useMemo(
    () => createHostTransferPreview(mode, { members }),
    [mode, members],
  );
  useEffect(() => {
    const listener = (event: Event) => {
      const kind = (event as CustomEvent<unknown>).detail;
      if (kind === "aba" || kind === "recipient-left") server.serverEvent(kind);
    };
    window.addEventListener("host-transfer-preview", listener);
    return () => window.removeEventListener("host-transfer-preview", listener);
  }, [server]);
  return (
    <div style={{ height: "100dvh" }}>
      <RoomLobby
        roomId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        inviteCode="ABC234"
        inviteUrl="https://example.test/invite/ABC234"
        currentUserId={PREVIEW_HOST}
        isHost
        hostUserId={PREVIEW_HOST}
        initialPhase={{ kind: "lobby" }}
        initialMembers={members}
        webSocketFactory={server.factory}
      />
    </div>
  );
}
const meta = {
  title: "Room/HostTransferFlow",
  component: HostTransferPreview,
  parameters: { layout: "fullscreen", activeRoomConnection: true },
  args: { mode: "success" },
} satisfies Meta<typeof HostTransferPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Success: Story = {};
export const Refused: Story = { args: { mode: "refused" } };
export const Reconnect: Story = { args: { mode: "reconnect" } };
export const OverflowSelf: Story = { args: { overflow: true } };

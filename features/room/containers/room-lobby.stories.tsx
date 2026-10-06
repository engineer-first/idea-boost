import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useMemo } from "react";
import {
  createHostTransferPreview,
  type HostPreviewMode,
  PREVIEW_HOST,
  PREVIEW_MEMBERS,
} from "../logic/host-transfer-preview.fixture";
import { RoomLobby } from "./room-lobby";

function HostTransferPreview({ mode }: { mode: HostPreviewMode }) {
  const server = useMemo(() => createHostTransferPreview(mode), [mode]);
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
        initialMembers={PREVIEW_MEMBERS}
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

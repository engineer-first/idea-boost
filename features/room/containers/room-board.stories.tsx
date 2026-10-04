import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useMemo } from "react";
import { Toaster } from "@/components/ui/sonner";
import type { RoomPhase, RoomStepPhase } from "@/contracts/phase";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildDecision,
  buildSharingState,
} from "@/contracts/room-protocol.fixture";
import {
  ACTIVE_PREVIEW_MEMBERS,
  ACTIVE_PREVIEW_NOTES,
  ACTIVE_PREVIEW_TIMER,
  createHostTransferPreview,
  type HostPreviewMode,
  PREVIEW_HOST,
  PREVIEW_TARGET,
} from "../logic/host-transfer-preview.fixture";
import { RoomBoard } from "./room-board";

const ACTIVE_PHASE = buildPhaseStep(3);

type ActiveHostTransferPreviewProps = {
  mode: HostPreviewMode;
  phase: RoomPhase;
  participant: boolean;
  completed: boolean;
};

function ActiveHostTransferPreview({
  mode,
  phase,
  participant,
  completed,
}: ActiveHostTransferPreviewProps) {
  const currentUserId = participant ? PREVIEW_TARGET : PREVIEW_HOST;
  const server = useMemo(
    () =>
      createHostTransferPreview(mode, {
        phase,
        currentUserId,
        members: ACTIVE_PREVIEW_MEMBERS,
        notes: ACTIVE_PREVIEW_NOTES,
        timer: ACTIVE_PREVIEW_TIMER,
        sharing:
          phase.kind === "step" && phase.step === 2
            ? buildSharingState({
                order: ACTIVE_PREVIEW_MEMBERS,
                status: "active",
                currentIndex: 0,
              })
            : null,
        decision: completed
          ? buildDecision({ phase: 3, noteId: ACTIVE_PREVIEW_NOTES[0].id })
          : null,
        outcomePublished: completed,
      }),
    [mode, phase, currentUserId, completed],
  );
  useEffect(() => {
    const listener = (event: Event) => {
      const kind = (event as CustomEvent<unknown>).detail;
      if (
        kind === "aba" ||
        kind === "recipient-left" ||
        kind === "disconnect" ||
        kind === "reconnect"
      ) {
        server.serverEvent(kind);
      }
    };
    window.addEventListener("host-transfer-preview", listener);
    return () => window.removeEventListener("host-transfer-preview", listener);
  }, [server]);
  return (
    <div style={{ height: "100dvh" }}>
      <RoomBoard
        roomId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        inviteCode="ABC234"
        inviteUrl="https://example.test/invite/ABC234"
        currentUserId={currentUserId}
        isHost={!participant}
        hostUserId={PREVIEW_HOST}
        initialPhase={phase}
        initialMembers={ACTIVE_PREVIEW_MEMBERS}
        webSocketFactory={server.factory}
      />
      <Toaster />
    </div>
  );
}

const meta = {
  title: "Room/ActiveHostTransferFlow",
  component: ActiveHostTransferPreview,
  parameters: { layout: "fullscreen", chromatic: { viewports: [390, 1280] } },
  args: {
    mode: "success",
    phase: ACTIVE_PHASE,
    participant: false,
    completed: false,
  },
} satisfies Meta<typeof ActiveHostTransferPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {};
export const Refused: Story = { args: { mode: "refused" } };
export const Timeout: Story = { args: { mode: "timeout" } };
export const Reconnect: Story = { args: { mode: "reconnect" } };
export const Participant: Story = { args: { participant: true } };
export const Completed: Story = {
  args: { phase: buildPhaseStep(5, 3), completed: true },
};

function phaseStory(phase: RoomStepPhase["phase"], step: number): Story {
  return { args: { phase: buildPhaseStep(step, phase) } };
}
export const Phase1Step1: Story = phaseStory(1, 1);
export const Phase1Step2: Story = phaseStory(1, 2);
export const Phase1Step3: Story = phaseStory(1, 3);
export const Phase1Step4: Story = phaseStory(1, 4);
export const Phase1Step5: Story = phaseStory(1, 5);
export const Phase2Step1: Story = phaseStory(2, 1);
export const Phase2Step2: Story = phaseStory(2, 2);
export const Phase2Step3: Story = phaseStory(2, 3);
export const Phase2Step4: Story = phaseStory(2, 4);
export const Phase3Step1: Story = phaseStory(3, 1);
export const Phase3Step2: Story = phaseStory(3, 2);
export const Phase3Step3: Story = phaseStory(3, 3);
export const Phase3Step4: Story = phaseStory(3, 4);
export const Phase3Step5: Story = phaseStory(3, 5);

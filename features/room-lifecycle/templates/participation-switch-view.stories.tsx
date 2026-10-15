import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  failedParticipation,
  switchConfirmation,
} from "../logic/participation.fixture";
import { ParticipationSwitchView } from "./participation-switch-view";

const meta = {
  title: "RoomLifecycle/ParticipationSwitch",
  component: ParticipationSwitchView,
  args: {
    confirmation: switchConfirmation(),
    outcomeAccess: "discard",
    pending: false,
    started: false,
    onCancel: () => {},
    onConfirm: () => {},
    onRetry: () => {},
    onOutcomeAccess: () => {},
  },
} satisfies Meta<typeof ParticipationSwitchView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Leave: Story = {};
export const Transfer: Story = {
  args: { confirmation: switchConfirmation("transfer") },
};
export const Disband: Story = {
  args: { confirmation: switchConfirmation("disband") },
};
export const Pending: Story = { args: { pending: true, started: true } };
export const ConnectionFailure: Story = {
  args: {
    started: true,
    message: "通信が途切れました。移動が完了したか結果を確認してください。",
  },
};
export const Changed: Story = {
  args: {
    confirmation: switchConfirmation("disband"),
    message:
      "参加状況が変わりました。内容を確認して、もう一度決定してください。",
  },
};
export const Create: Story = {
  args: {
    confirmation: {
      ...switchConfirmation(),
      target: {
        kind: "create",
        input: {
          name: "ルームB",
          expectedPrincipal: "11111111-1111-4111-8111-111111111111",
          requestId: "55555555-5555-4555-8555-555555555555",
        },
      },
    },
  },
};

export const RecoveredPending: Story = {
  args: {
    confirmation: undefined,
    started: true,
    message: "移動中の処理が見つかりました。結果を確認してください。",
  },
};

export const PartiallyLeft: Story = {
  args: {
    confirmation: {
      ...switchConfirmation("transfer"),
      progress: "partially_left",
      outcomeAccess: "retain",
    },
    outcomeAccess: "retain",
    message: "引継ぎ先が変わりました。再確認が必要です。",
  },
};

export const LongRoomNames: Story = {
  args: {
    confirmation: {
      ...switchConfirmation("transfer"),
      targetName: `${"DestinationRoom".repeat(5)}ABCDE`,
      sources: switchConfirmation("transfer").sources.map((source) => ({
        ...source,
        name: `${"CurrentRoom".repeat(7)}ABC`,
        successor: {
          userId: "44444444-4444-4444-8444-444444444444",
          name: `${"Successor".repeat(8)}ABCDEFGH`,
        },
      })),
    },
  },
};

export const TerminalFailure: Story = {
  args: { confirmation: undefined, failedOperation: failedParticipation() },
};
export const SourceMaintainedFailure: Story = {
  args: {
    confirmation: undefined,
    failedOperation: {
      ...failedParticipation(),
      failure: {
        operationId: switchConfirmation().operationId,
        exitedSources: [],
        remainingSources: switchConfirmation().sources,
      },
    },
  },
};

export const Reopenable: Story = {
  render: (args) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>参加先を確認する</Button>
        {open && (
          <ParticipationSwitchView {...args} onCancel={() => setOpen(false)} />
        )}
      </>
    );
  },
};

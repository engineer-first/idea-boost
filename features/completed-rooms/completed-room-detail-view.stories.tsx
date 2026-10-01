import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import type { CompletedSceneKind } from "@/contracts/completed-rooms";
import {
  completedBoardFixture,
  completedRoomFixture,
  completedSceneBoardFixture,
} from "@/contracts/completed-rooms.fixture";
import { useFeedback } from "@/features/feedback";
import { CompletedRoomDetailView } from "./completed-room-detail-view";

const meta = {
  title: "CompletedRooms/Detail",
  component: CompletedRoomDetailView,
  parameters: { layout: "fullscreen" },
  args: {
    room: completedRoomFixture(),
    loading: false,
    error: null,
    expanded: false,
    selected: "problem-grouping",
    scene: {
      scene: {
        kind: "problem-grouping",
        recordedAt: 1790683000000,
        status: "saved",
      },
      board: completedBoardFixture(),
    },
    sceneLoading: false,
    sceneError: null,
    onRetry: fn(),
    onToggle: fn(),
    onSelect: fn(),
    onSceneRetry: fn(),
  },
  render: function Render(args) {
    const feedback = useFeedback(
      args.room?.roomId ?? "completed-story",
      async (_room, input) => ({ ok: true, id: input.id }),
    );
    return <CompletedRoomDetailView {...args} feedback={feedback} />;
  },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompletedRoomDetailView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Success: Story = {};
export const History: Story = {
  args: { expanded: true },
  render: (args) => {
    const feedback = useFeedback(
      args.room?.roomId ?? "completed-history-story",
      async (_room, input) => ({ ok: true, id: input.id }),
    );
    const [expanded, setExpanded] = useState(true);
    const [selected, setSelected] =
      useState<CompletedSceneKind>("problem-grouping");
    return (
      <CompletedRoomDetailView
        {...args}
        feedback={feedback}
        expanded={expanded}
        selected={selected}
        onToggle={() => setExpanded((value) => !value)}
        onSelect={setSelected}
        scene={{
          scene: { kind: selected, recordedAt: 1790683000000, status: "saved" },
          board: completedSceneBoardFixture(selected),
        }}
      />
    );
  },
};
export const Loading: Story = { args: { room: null, loading: true } };
export const Unavailable: Story = {
  args: {
    room: null,
    error: "成果を取得できませんでした。再取得をお試しください。",
  },
};
export const SceneError: Story = {
  args: {
    expanded: true,
    scene: null,
    sceneError: "場面を取得できませんでした。場面を再取得してください。",
  },
};
export const Pending: Story = {
  args: {
    expanded: true,
    scene: {
      scene: {
        kind: "problem-grouping",
        recordedAt: 1790683000000,
        status: "pending",
      },
      board: null,
    },
  },
};
export const Failed: Story = {
  args: {
    expanded: true,
    scene: {
      scene: {
        kind: "problem-grouping",
        recordedAt: 1790683000000,
        status: "failed",
      },
      board: null,
    },
  },
};
export const Missing: Story = {
  args: {
    expanded: true,
    scene: {
      scene: {
        kind: "problem-grouping",
        recordedAt: 1790683000000,
        status: "missing",
      },
      board: null,
    },
  },
};
export const BeforeRecording: Story = {
  args: {
    expanded: true,
    scene: {
      scene: {
        kind: "problem-grouping",
        recordedAt: null,
        status: "before-recording",
      },
      board: null,
    },
  },
};
export const SceneLoading: Story = {
  args: { expanded: true, scene: null, sceneLoading: true },
};
export const EmptyBoard: Story = {
  args: {
    expanded: true,
    scene: {
      scene: {
        kind: "problem-grouping",
        recordedAt: 1790683000000,
        status: "saved",
      },
      board: completedBoardFixture({ notes: [], groups: [] }),
    },
  },
};

// 固定成果閲覧権は投稿権を意味しない。現在非在籍を返す送信fixture。
export const FeedbackAfterLeave: Story = {
  render: function Render(args) {
    const feedback = useFeedback(
      args.room?.roomId ?? "completed-left-story",
      async () => ({
        ok: false,
        error: "参加中のルームを確認できません。退出・解散後は送信できません。",
      }),
    );
    return <CompletedRoomDetailView {...args} feedback={feedback} />;
  },
};

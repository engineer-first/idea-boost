import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildGroup, buildNote } from "@/contracts/room-protocol.fixture";
import { ExcludedNotesDialog } from "./excluded-notes-dialog";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const meta = {
  title: "Notes/ExcludedNotesDialog",
  component: ExcludedNotesDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    currentUserId: ME,
    isHost: false,
    isDisconnected: false,
    onRestore: fn(),
    groups: [buildGroup({ name: "課題のグループ" })],
    notes: [
      buildNote({
        id: "note-1",
        authorId: ME,
        excluded: true,
        content:
          "会議の前に論点を整理し、関係者が背景を理解したうえで次の一歩を具体的に決められるようにする",
        dotVotes: {
          subjective: { count: 1, votedByMe: false, ownCount: 0 },
          objective: { count: 3, votedByMe: false, ownCount: 0 },
        },
      }),
      buildNote({
        id: "note-2",
        authorId: OTHER,
        excluded: true,
        color: "blue",
        content: "別の候補（作者は別の参加者）",
      }),
    ],
  },
} satisfies Meta<typeof ExcludedNotesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Empty: Story = { args: { notes: [], groups: [] } };

export const NotAuthor: Story = { args: { currentUserId: OTHER } };

export const Disconnected: Story = { args: { isDisconnected: true } };

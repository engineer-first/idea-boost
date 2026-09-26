import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { writeNoteDraft } from "../logic/note-draft";
import { NoteCard } from "./note-card";

const meta = {
  title: "Notes/NoteCard",
  component: NoteCard,
  parameters: {
    layout: "padded",
  },
  args: {
    note: buildNote(),
    isOwnDrag: false,
    isSelected: false,
    canEditNote: true,
    canDeleteNote: true,
    canMoveNote: true,
    onSelect: fn(),
    onDragStart: fn(),
    onContentChange: fn(),
    onDelete: fn(),
    vote: {
      displayMode: "hidden",
      selectedKind: null,
      voteRemaining: { subjective: 1, objective: 3 },
      canVote: false,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: 400, minHeight: 300 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NoteCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const DRAFT_STORY_NOTE = buildNote({ content: "サーバーに保存済みの本文" });
const DRAFT_STORY_SCOPE = {
  roomId: "storybook-draft-room",
  userId: DRAFT_STORY_NOTE.authorId,
};

export const DraftAfterPhaseTransition: Story = {
  args: {
    note: DRAFT_STORY_NOTE,
    draftScope: DRAFT_STORY_SCOPE,
    editingDisabled: true,
    isSelected: true,
  },
  loaders: [
    async () => {
      writeNoteDraft(DRAFT_STORY_SCOPE, DRAFT_STORY_NOTE.id, {
        baseContent: DRAFT_STORY_NOTE.content,
        content: "次のステップに進む前に書いていた下書き",
      });
      return {};
    },
  ],
};

export const DraftWithServerConflict: Story = {
  args: {
    note: DRAFT_STORY_NOTE,
    draftScope: DRAFT_STORY_SCOPE,
    isSelected: true,
  },
  loaders: [
    async () => {
      writeNoteDraft(DRAFT_STORY_SCOPE, DRAFT_STORY_NOTE.id, {
        baseContent: "編集前の本文",
        content: "競合した未送信の下書き",
      });
      return {};
    },
  ],
};

export const Empty: Story = {
  args: {
    note: buildNote({ content: "" }),
  },
};

export const LongContent: Story = {
  args: {
    note: buildNote({
      content:
        "長めのメモの例です。本文が基準高に収まらない場合は、文字サイズを保ったまま全文が見える高さまで付箋が伸びます。".repeat(
          2,
        ),
    }),
  },
};

export const ShortAt12px: Story = {
  args: {
    note: buildNote({ content: "短い本文", fontSize: 12 }),
  },
};

export const MediumAt14px: Story = {
  args: {
    note: buildNote({
      content:
        "中程度の本文です。改行や折り返しを含んでも、付箋の中で全文を続けて読めます。\n操作のための余白も保ちます。",
      fontSize: 14,
    }),
  },
};

export const LongAt24px: Story = {
  args: {
    note: buildNote({
      content:
        "24pxの長文です。文字を自動で縮小せず、本文の終わりまで表示できるように付箋そのものが縦へ伸びます。".repeat(
          6,
        ),
      fontSize: 24,
    }),
    className: "relative",
    style: {},
  },
};

export const MaximumLengthAt24px: Story = {
  args: {
    note: buildNote({
      content: "最大長の確認用本文。".repeat(200).slice(0, 2_000),
      fontSize: 24,
    }),
    className: "relative",
    style: {},
  },
};

// 選択状態: 青い枠が付き、Backspace/Deleteで削除・再クリックまたは文字入力で編集に入る。
export const Selected: Story = {
  args: {
    isSelected: true,
  },
};

export const DirectInput: Story = {
  args: {
    isSelected: true,
    note: buildNote({ content: "" }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const surface = canvas.getByRole("button", { name: "付箋" });
    surface.focus();
    await userEvent.keyboard("a");
    await expect(canvas.getByRole("textbox")).toHaveValue("a");
  },
};

// 自分がドラッグ中: 「持ち上げた」表現として影が深くなる。
export const Dragging: Story = {
  args: {
    isSelected: true,
    isOwnDrag: true,
  },
};

export const Voted: Story = {
  args: {
    note: buildNote({
      dotVotes: {
        subjective: { count: 1, votedByMe: true, ownCount: 1 },
        objective: { count: 3, votedByMe: false, ownCount: 0 },
      },
    }),
    vote: {
      displayMode: "voting",
      selectedKind: null,
      voteRemaining: { subjective: 0, objective: 1 },
      canVote: true,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
};

export const VotePreview: Story = {
  args: {
    vote: {
      displayMode: "voting",
      selectedKind: "subjective",
      voteRemaining: { subjective: 1, objective: 3 },
      canVote: true,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
};

export const Decided: Story = {
  args: {
    isDecided: true,
  },
};

export const ExcludedForHost: Story = {
  args: {
    note: buildNote({ excluded: true }),
    canEditNote: false,
    canDeleteNote: false,
    canMoveNote: false,
    canExcludeNote: true,
    canRestoreNote: true,
    onExclude: fn(),
    onRestore: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const card = canvas.getByTestId("note-card");
    const surface = canvas.getByRole("button", { name: "候補外の付箋" });
    const restore = page.getByRole("button", { name: "候補に戻す" });

    await userEvent.hover(surface);
    await waitFor(() => expect(restore).toBeVisible());
    await userEvent.unhover(surface);
    surface.focus();
    await waitFor(() => expect(restore).toBeVisible());
    surface.blur();
    fireEvent.pointerDown(surface, { pointerId: 7, pointerType: "touch" });
    fireEvent.pointerUp(surface, { pointerId: 7, pointerType: "touch" });
    await waitFor(() => expect(restore).toBeVisible());
    await waitFor(() => expect(getComputedStyle(card).opacity).toBe("0.9"));
    await expect(canvas.queryByText("候補外")).not.toBeInTheDocument();
  },
};

export const CandidateContextMenu: Story = {
  args: {
    canExcludeNote: true,
    onExclude: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const surface = canvas.getByRole("button", { name: "付箋" });

    fireEvent.contextMenu(surface);
    await expect(args.onExclude).not.toHaveBeenCalled();
    await userEvent.click(page.getByRole("menuitem", { name: "候補から外す" }));
    await expect(args.onExclude).toHaveBeenCalledWith("note-1");
  },
};

export const CandidateActionForTouch: Story = {
  args: {
    canExcludeNote: true,
    onExclude: fn(),
  },
};

export const MultipleCandidateActionsForTouch: Story = {
  args: {
    canExcludeNote: true,
    onExclude: fn(),
  },
  render: (args) => (
    <>
      <NoteCard
        {...args}
        note={buildNote({ id: "first-note", content: "最初の付箋" })}
        style={{ left: 20, top: 20 }}
      />
      <NoteCard
        {...args}
        note={buildNote({ id: "second-note", content: "次の付箋" })}
        style={{ left: 220, top: 20 }}
      />
    </>
  ),
};

export const OverlappedCandidateAction: Story = {
  args: {
    canExcludeNote: true,
    onExclude: fn(),
  },
  render: (args) => (
    <>
      <NoteCard
        {...args}
        note={buildNote({
          id: "target-note",
          content: "奥にある候補",
        })}
        style={{ left: 30, top: 30, zIndex: 1 }}
      />
      <NoteCard
        {...args}
        note={buildNote({
          id: "front-note",
          content: "手前の付箋",
        })}
        style={{ left: 54, top: 80, zIndex: 2 }}
      />
    </>
  ),
  play: async ({ canvasElement }) => {
    const target = canvasElement.querySelector<HTMLElement>(
      '[data-note-id="target-note"]',
    );
    if (!target) throw new Error("対象の付箋がありません");
    const surface = within(target).getByRole("button", { name: "付箋" });
    const action = canvasElement.ownerDocument.querySelector<HTMLButtonElement>(
      '[data-candidate-action-note-id="target-note"]',
    );
    if (!action) throw new Error("対象の候補操作がありません");

    await userEvent.hover(surface);
    await waitFor(() => expect(action).toBeVisible());
    await expect(target).not.toContainElement(action);
  },
};

export const ExcludedKeyboardMenu: Story = {
  args: {
    note: buildNote({ excluded: true }),
    canEditNote: false,
    canDeleteNote: false,
    canMoveNote: false,
    canRestoreNote: true,
    onRestore: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const surface = canvas.getByRole("button", { name: "候補外の付箋" });
    surface.focus();
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    const menuItem = page.getByRole("menuitem", { name: "候補に戻す" });
    await expect(menuItem).toHaveFocus();
    await expect(args.onRestore).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onRestore).toHaveBeenCalledWith("note-1");
  },
};

export const ExcludedForParticipant: Story = {
  args: {
    note: buildNote({ excluded: true }),
    canEditNote: false,
    canDeleteNote: false,
    canMoveNote: false,
    canExcludeNote: false,
    canRestoreNote: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const card = canvas.getByTestId("note-card");
    const surface = canvas.getByRole("button", { name: "候補外の付箋" });

    fireEvent.pointerDown(surface, { pointerId: 8, pointerType: "touch" });
    fireEvent.pointerUp(surface, { pointerId: 8, pointerType: "touch" });

    await waitFor(() => expect(getComputedStyle(card).opacity).toBe("0.9"));
    await expect(canvas.queryByText("候補外")).not.toBeInTheDocument();
    await expect(
      page.queryByRole("button", { name: "候補に戻す" }),
    ).not.toBeInTheDocument();
  },
};

export const ResultStep: Story = {
  args: {
    isSelected: true,
    editingDisabled: true,
    note: buildNote({
      content: "0票のときは結果シールも票数も表示しません。",
      dotVotes: {
        subjective: { count: 0, votedByMe: false, ownCount: 0 },
        objective: { count: 0, votedByMe: false, ownCount: 0 },
      },
    }),
    vote: {
      displayMode: "result",
      selectedKind: null,
      voteRemaining: { subjective: 0, objective: 0 },
      canVote: false,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
};

export const ResultWithFewVotes: Story = {
  args: {
    editingDisabled: true,
    note: buildNote({
      content: "少数票は1票1枚のシールで比較できます。",
      dotVotes: {
        subjective: { count: 1, votedByMe: false, ownCount: 0 },
        objective: { count: 3, votedByMe: false, ownCount: 0 },
      },
    }),
    vote: {
      displayMode: "result",
      selectedKind: null,
      voteRemaining: { subjective: 0, objective: 0 },
      canVote: false,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
};

export const ResultWithLongContent: Story = {
  args: {
    editingDisabled: true,
    note: buildNote({
      content:
        "長文のアイデアでも、本文が結果シールの下へ潜り込まないように付箋の内側に専用の結果余白を確保します。本文はスクロールして全文を読めます。",
      dotVotes: {
        subjective: { count: 2, votedByMe: false, ownCount: 0 },
        objective: { count: 7, votedByMe: false, ownCount: 0 },
      },
    }),
    vote: {
      displayMode: "result",
      selectedKind: null,
      voteRemaining: { subjective: 0, objective: 0 },
      canVote: false,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
};

export const ResultWithManyVotes: Story = {
  args: {
    editingDisabled: true,
    note: buildNote({
      content: "10票を超えても、間隔だけを狭めて全票分を表示します。",
      dotVotes: {
        subjective: { count: 12, votedByMe: false, ownCount: 0 },
        objective: { count: 27, votedByMe: false, ownCount: 0 },
      },
    }),
    vote: {
      displayMode: "result",
      selectedKind: null,
      voteRemaining: { subjective: 0, objective: 0 },
      canVote: false,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
};

export const ResultWithCandidateAction: Story = {
  args: {
    editingDisabled: true,
    canEditNote: false,
    canDeleteNote: false,
    canMoveNote: false,
    canExcludeNote: true,
    onExclude: fn(),
    note: buildNote({
      content: "付箋外の候補操作と結果表示を重ねずに表示します。",
      dotVotes: {
        subjective: { count: 3, votedByMe: false, ownCount: 0 },
        objective: { count: 8, votedByMe: false, ownCount: 0 },
      },
    }),
    vote: {
      displayMode: "result",
      selectedKind: null,
      voteRemaining: { subjective: 0, objective: 0 },
      canVote: false,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByRole("button", { name: "付箋" }));
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "候補から外す" }),
      ).toBeVisible(),
    );
  },
};

export const ResultExcludedForHost: Story = {
  args: {
    editingDisabled: true,
    canEditNote: false,
    canDeleteNote: false,
    canMoveNote: false,
    canRestoreNote: true,
    onRestore: fn(),
    note: buildNote({
      content: "候補外の本文・票・配置は保ったまま戻せます。",
      excluded: true,
      dotVotes: {
        subjective: { count: 2, votedByMe: false, ownCount: 0 },
        objective: { count: 5, votedByMe: false, ownCount: 0 },
      },
    }),
    vote: {
      displayMode: "result",
      selectedKind: null,
      voteRemaining: { subjective: 0, objective: 0 },
      canVote: false,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByRole("button", { name: "候補外の付箋" }));
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "候補に戻す" })).toBeVisible(),
    );
  },
};

export const ResultWithDecision: Story = {
  args: {
    isDecided: true,
    editingDisabled: true,
    note: buildNote({
      content: "決定済みの印と結果表示を同時に確認できます。",
      dotVotes: {
        subjective: { count: 4, votedByMe: false, ownCount: 0 },
        objective: { count: 10, votedByMe: false, ownCount: 0 },
      },
    }),
    vote: {
      displayMode: "result",
      selectedKind: null,
      voteRemaining: { subjective: 0, objective: 0 },
      canVote: false,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
};

export const ResultOnDarkCanvas: Story = {
  args: {
    ...ResultWithManyVotes.args,
    className: "relative",
    style: {},
  },
  decorators: [
    (Story) => (
      <div className="rounded-lg bg-slate-950 p-12">
        <Story />
      </div>
    ),
  ],
};

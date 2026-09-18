import type { CSSProperties } from "react";
import { useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Button } from "@/components/ui/button";
import type { ProtocolMember } from "@/contracts/room-protocol";
import { StickyNote } from "@/features/notes";
import type { RoomBoardInteractions } from "@/features/room/logic/use-room-board-interactions";
import { RoomBoardView } from "@/features/room/templates/room-board-view";
import { RoomLobbyView } from "@/features/room/templates/room-lobby-view";
import {
  CreateRoomSectionView,
  JoinRoomSectionView,
} from "@/features/room-lifecycle";
import { InteractionOverlay } from "./components/interaction-overlay";
import { ProductStage } from "./components/product-stage";
import {
  getOperationBoardData,
  getOperationHelp,
  getOperationMoment,
  type OperationMoment,
} from "./data/operation-demo-state";

export type IdeaFlowOperationDemoProps = Record<string, never>;

const CURRENT_USER_ID = "11111111-1111-4111-8111-111111111111";
const MEMBERS: readonly ProtocolMember[] = [
  { userId: CURRENT_USER_ID, name: "Yuki Tanaka", color: "yellow" },
  {
    userId: "22222222-2222-4222-8222-222222222222",
    name: "Taro Yamada",
    color: "green",
  },
  {
    userId: "33333333-3333-4333-8333-333333333333",
    name: "Hanako Sato",
    color: "blue",
  },
  {
    userId: "44444444-4444-4444-8444-444444444444",
    name: "Mei Suzuki",
    color: "pink",
  },
];

const GRID_STYLE: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 1.5px)",
  backgroundPosition: "0 0",
  backgroundSize: "20px 20px",
};

const noop = () => undefined;

export function IdeaFlowOperationDemo(_props: IdeaFlowOperationDemoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const moment = getOperationMoment(frame, fps);

  return (
    <AbsoluteFill
      data-remotion-operation-demo="true"
      style={{
        overflow: "hidden",
        background:
          "radial-gradient(circle at 18% 16%, rgba(191,219,254,0.8), transparent 32%), radial-gradient(circle at 83% 78%, rgba(221,214,254,0.72), transparent 34%), #eef2f7",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.25), transparent 76%)",
        }}
      />
      <ProductStage
        moment={moment}
        fps={fps}
        overlay={<InteractionOverlay moment={moment} fps={fps} />}
      >
        <OperationScreen moment={moment} />
      </ProductStage>
    </AbsoluteFill>
  );
}

function OperationScreen({ moment }: { moment: OperationMoment }) {
  if (moment.screen === "home") return <DemoHome moment={moment} />;
  if (moment.screen === "lobby") return <DemoLobby moment={moment} />;
  return <DemoBoard moment={moment} />;
}

function DemoAppHeader() {
  return (
    <header
      className="sticky top-0 z-50 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur"
      data-testid="operation-demo-app-header"
    >
      <p className="text-base font-semibold tracking-tight">Idea Boost</p>
      <div className="flex min-w-0 items-center gap-3">
        <p className="truncate text-sm text-muted-foreground">Yuki Tanaka</p>
        <Button type="button" variant="outline" size="sm">
          ログアウト
        </Button>
      </div>
    </header>
  );
}

function DemoHome({ moment }: { moment: OperationMoment }) {
  const pending = moment.progress >= 0.67;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <DemoAppHeader />
      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-muted/40"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-1/4 size-72 rounded-full bg-primary/5 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 bottom-1/4 size-80 rounded-full bg-secondary blur-3xl"
        />

        <div className="relative z-10 flex w-full max-w-2xl flex-col gap-6">
          <header className="space-y-2 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Design Sprintを始めましょう
            </h1>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              新しいルームを作成するか、招待コードを入力して参加できます。
            </p>
          </header>
          <div className="grid grid-cols-2 items-stretch gap-4">
            <CreateRoomSectionView pending={pending} onSubmit={noop} />
            <JoinRoomSectionView
              code=""
              onCodeChange={noop}
              dialogOpen={false}
              onDialogOpenChange={noop}
              hostName=""
              onSubmit={(event) => event.preventDefault()}
              onConfirm={noop}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function DemoLobby({ moment }: { moment: OperationMoment }) {
  const memberCount =
    moment.progress < 0.16
      ? 1
      : moment.progress < 0.32
        ? 2
        : moment.progress < 0.48
          ? 3
          : 4;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <DemoAppHeader />
      <RoomLobbyView
        members={MEMBERS.slice(0, memberCount)}
        currentUserId={CURRENT_USER_ID}
        isHost
        hostUserId={CURRENT_USER_ID}
        phase={{ kind: "lobby" }}
        inviteCode="AB12CD"
        inviteUrl="https://idea-flow.example/invite/AB12CD"
        connectionStatus="open"
        isStarting={moment.progress >= 0.78}
        onStart={noop}
        onLeave={noop}
        isLeaving={false}
      />
    </div>
  );
}

function DemoBoard({ moment }: { moment: OperationMoment }) {
  const boardRootRef = useRef<HTMLDivElement>(null);
  const boardScrollerRef = useRef<HTMLDivElement>(null);
  const ideaMapPlaneRef = useRef<HTMLDivElement>(null);
  const privateToolbarRef = useRef<HTMLDivElement>(null);
  const data = getOperationBoardData(moment);

  if (!moment.phase || moment.phase.kind === "lobby") return null;

  const interactions: RoomBoardInteractions = {
    boardRootRef,
    boardScrollerRef,
    ideaMapPlaneRef,
    privateToolbarRef,
    notes: data.notes,
    privateNotes: data.privateNotes,
    dragGhost: data.dragGhost,
    isReturnDropTarget: false,
    isNoteDragging: data.draggingNoteId !== null,
    camera: { x: 0, y: 0, zoom: 1 },
    gridStyle: GRID_STYLE,
    isPanning: false,
    onCanvasPointerDown: noop,
    onCanvasPointerMove: noop,
    onCanvasPointerEnd: noop,
    onPresencePointerMove: noop,
    onPresencePointerLeave: noop,
    onZoomIn: noop,
    onZoomOut: noop,
    onResetZoom: noop,
    onFitToNotes: noop,
    onPointerMove: noop,
    onPointerEnd: noop,
    onNoteDragStart: noop,
    onPrivateNoteDragStart: noop,
  };

  return (
    <div className="relative h-full">
      {moment.segmentId === "complete" ? (
        <style>{`[data-slot="dialog-overlay"], [data-slot="dialog-content"] { display: none; }`}</style>
      ) : null}
      <RoomBoardView
        notes={data.notes}
        groups={data.groups}
        inviteCode="AB12CD"
        inviteUrl="https://idea-flow.example/invite/AB12CD"
        phase={moment.phase}
        timer={{ status: "idle" }}
        timerServerOffsetMs={0}
        isHost
        decision={data.decision}
        connectionStatus="open"
        renderMode="deterministic"
        draggingNoteId={data.draggingNoteId}
        members={[...MEMBERS]}
        currentUserId={CURRENT_USER_ID}
        hostUserId={CURRENT_USER_ID}
        isNextPhasePending={false}
        interactions={interactions}
        help={{
          ...getOperationHelp(moment),
          onOpenChange: noop,
          onTabChange: noop,
        }}
        remoteCursors={data.remoteCursors}
        remoteNoteDrags={data.remoteNoteDrags}
        areCursorsVisible
        onToggleCursors={noop}
        hmwDecidedIssue={data.hmwDecidedIssue}
        decidedHmw={data.decidedHmw}
        onAddPrivateNote={noop}
        onHmwTemplateSelect={noop}
        onIdeaHintSelect={noop}
        onPrivateNoteContentChange={noop}
        onPrivateNoteDelete={noop}
        onNoteContentChange={noop}
        onNoteDelete={noop}
        onGroupCreate={noop}
        onGroupUpdateName={noop}
        onNoteVote={noop}
        onNoteVoteRemove={noop}
        onNoteVoteStickerRemove={noop}
        onNoteVoteStickerMove={noop}
        pendingVoteOperations={[]}
        voteFeedback={null}
        onNoteDecide={noop}
        onLeave={noop}
        isLeaving={false}
        onNextPhase={noop}
        onTimerStart={noop}
        onTimerPause={noop}
        onTimerResume={noop}
        onTimerExtend={noop}
        onTimerStop={noop}
      />
      {data.viewportDragGhost ? (
        <StickyNote
          noteId={data.viewportDragGhost.note.id}
          isLifted
          color={data.viewportDragGhost.note.color}
          className="pointer-events-none absolute z-50"
          style={{
            left: data.viewportDragGhost.x,
            top: data.viewportDragGhost.y,
          }}
        >
          <p className="min-h-0 flex-1 overflow-hidden p-2 text-sm text-slate-900 dark:text-slate-50">
            {data.viewportDragGhost.note.content || "メモを入力..."}
          </p>
        </StickyNote>
      ) : null}
    </div>
  );
}

// Storybook/実ブラウザのみに使うWS境界。RoomDOの検証はWorker統合テストで行う。
import type { RoomPhase } from "@/contracts/phase";
import type {
  ClientMessage,
  Decision,
  ProtocolMember,
  ProtocolNote,
  ServerMessage,
  SharingState,
  TimerState,
} from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";
import type { RoomSocketFactory } from "@/lib/room-client/room-client";

export const PREVIEW_HOST = "11111111-1111-4111-8111-111111111111";
export const PREVIEW_TARGET = "22222222-2222-4222-8222-222222222222";
export const PREVIEW_MEMBERS: ProtocolMember[] = [
  { userId: PREVIEW_HOST, name: "Yuki Tanaka", color: "yellow" },
  { userId: PREVIEW_TARGET, name: "Hana Sato", color: "blue" },
];
export const ACTIVE_PREVIEW_MEMBERS: ProtocolMember[] = [
  { userId: PREVIEW_HOST, name: "Yuki Tanaka", color: "yellow" },
  { userId: PREVIEW_TARGET, name: "Hana Sato", color: "blue" },
];
export const ACTIVE_PREVIEW_NOTES: ProtocolNote[] = [
  buildNote({
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    authorId: PREVIEW_HOST,
    content: "初めての参加者が発言しづらい",
    x: 160,
    y: 260,
  }),
  buildNote({
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
    authorId: PREVIEW_TARGET,
    content: "考えを付箋に書く時間を設けたい",
    color: "blue",
    x: 440,
    y: 280,
    stackOrder: 1,
  }),
  buildNote({
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
    authorId: PREVIEW_HOST,
    content: "全員の案を見ながら次の一歩を決める",
    x: 720,
    y: 340,
    stackOrder: 2,
  }),
];
export const ACTIVE_PREVIEW_TIMER: TimerState = {
  status: "paused",
  remainingMs: 138_000,
  durationMs: 180_000,
};

type PreviewEvent = { data?: string; code?: number; reason?: string };
export type HostPreviewMode = "success" | "refused" | "reconnect" | "timeout";
export type HostPreviewServerEvent =
  | "aba"
  | "recipient-left"
  | "disconnect"
  | "reconnect";
export type HostTransferPreviewOptions = {
  phase?: RoomPhase;
  members?: ProtocolMember[];
  notes?: ProtocolNote[];
  timer?: TimerState;
  sharing?: SharingState | null;
  currentUserId?: string;
  hostUserId?: string;
  decision?: Decision | null;
  outcomePublished?: boolean;
};

class PreviewSocket {
  readyState = 0;
  private listeners = new Map<string, Array<(event: PreviewEvent) => void>>();
  constructor(
    private readonly receive: (
      message: ClientMessage,
      socket: PreviewSocket,
    ) => void,
  ) {}
  addEventListener(type: string, listener: (event: PreviewEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: PreviewEvent) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  message(message: ServerMessage) {
    this.emit("message", { data: JSON.stringify(message) });
  }
  send(data: string) {
    this.receive(JSON.parse(data) as ClientMessage, this);
  }
  close() {
    this.readyState = 3;
  }
  disconnect() {
    this.close();
    this.emit("close", { code: 1006, reason: "preview disconnect" });
  }
}

export function createHostTransferPreview(
  initialMode: HostPreviewMode,
  options: HostTransferPreviewOptions = {},
) {
  let mode = initialMode;
  let hostUserId = options.hostUserId ?? PREVIEW_HOST;
  let hostRevision = 0;
  let members = options.members ?? PREVIEW_MEMBERS;
  let canReconnect = true;
  let socket: PreviewSocket | undefined;
  const snapshot = (): ServerMessage => ({
    type: "snapshot",
    notes: options.notes ?? [],
    members,
    groups: [],
    phase: options.phase ?? { kind: "lobby" },
    phaseRevision: 0,
    isHost: hostUserId === (options.currentUserId ?? PREVIEW_HOST),
    hostUserId,
    hostRevision,
    decision: options.decision ?? null,
    outcomePublished: options.outcomePublished ?? false,
    carryovers: [],
    completedVoterIds: [],
    sharing: options.sharing ?? null,
    timer: options.timer ?? { status: "idle" },
    serverNow: Date.now(),
  });
  function open(created: PreviewSocket): void {
    if (created.readyState !== 0 || !canReconnect) return;
    created.readyState = 1;
    created.emit("open", {});
    created.message(snapshot());
  }
  const factory: RoomSocketFactory = () => {
    const created = new PreviewSocket((message, active) => {
      if (message.type === "member:remove") {
        setTimeout(() => {
          if (active.readyState !== 1) return;
          if (mode === "timeout") {
            mode = "success";
            return;
          }
          if (mode === "refused") {
            mode = "success";
            active.message({
              type: "error",
              code: "forbidden",
              operationId: message.operationId,
              message:
                "操作できませんでした。現在の参加者を確認してから操作し直してください。",
            });
            return;
          }
          members = members.filter(
            (member) => member.userId !== message.targetUserId,
          );
          active.message({ type: "member_left", userId: message.targetUserId });
          active.message({
            type: "member:removed",
            targetUserId: message.targetUserId,
            operationId: message.operationId,
          });
        }, 100);
        return;
      }
      if (message.type !== "host:transfer") return;
      setTimeout(() => {
        if (active.readyState !== 1) return;
        if (mode === "timeout") {
          mode = "success";
          return;
        }
        if (mode === "refused") {
          mode = "success";
          active.message({
            type: "error",
            code: "forbidden",
            operationId: message.operationId,
            message:
              "相手が切断しました。接続中のメンバーを選び直してください。",
          });
          return;
        }
        hostUserId = message.targetUserId;
        hostRevision++;
        if (mode === "reconnect") {
          active.disconnect();
          return;
        }
        active.message({ type: "host:updated", hostUserId, hostRevision });
      }, 100);
    });
    socket = created;
    setTimeout(() => open(created), 0);
    return created as unknown as WebSocket;
  };
  return {
    factory,
    // テストはサーバーからの非同期イベントをこのfixture専用境界へ送る。
    serverEvent(kind: HostPreviewServerEvent) {
      if (kind === "disconnect") {
        canReconnect = false;
        socket?.disconnect();
      } else if (kind === "reconnect") {
        canReconnect = true;
        if (socket) open(socket);
      } else if (kind === "recipient-left") {
        members = members.filter((member) => member.userId !== PREVIEW_TARGET);
        socket?.message({ type: "member_left", userId: PREVIEW_TARGET });
      } else {
        hostUserId = PREVIEW_TARGET;
        socket?.message({
          type: "host:updated",
          hostUserId,
          hostRevision: ++hostRevision,
        });
        hostUserId = PREVIEW_HOST;
        socket?.message({
          type: "host:updated",
          hostUserId,
          hostRevision: ++hostRevision,
        });
      }
    },
  };
}

// Storybook/実ブラウザのみに使うWS境界。RoomDOの検証はWorker統合テストで行う。
import type {
  ClientMessage,
  ProtocolMember,
  ServerMessage,
} from "@/contracts/room-protocol";
import type { RoomSocketFactory } from "@/lib/room-client/room-client";

export const PREVIEW_HOST = "11111111-1111-4111-8111-111111111111";
export const PREVIEW_TARGET = "22222222-2222-4222-8222-222222222222";
export const PREVIEW_MEMBERS: ProtocolMember[] = [
  { userId: PREVIEW_HOST, name: "作成者", color: "yellow" },
  { userId: PREVIEW_TARGET, name: "次の進行役", color: "blue" },
];
type PreviewEvent = { data?: string; code?: number; reason?: string };
export type HostPreviewMode = "success" | "refused" | "reconnect";

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

export function createHostTransferPreview(initialMode: HostPreviewMode) {
  let mode = initialMode;
  let hostUserId = PREVIEW_HOST;
  let hostRevision = 0;
  let members = PREVIEW_MEMBERS;
  let socket: PreviewSocket | undefined;
  const snapshot = (): ServerMessage => ({
    type: "snapshot",
    notes: [],
    members,
    groups: [],
    phase: { kind: "lobby" },
    phaseRevision: 0,
    isHost: hostUserId === PREVIEW_HOST,
    hostUserId,
    hostRevision,
    decision: null,
    carryovers: [],
    completedVoterIds: [],
    timer: { status: "idle" },
    serverNow: Date.now(),
  });
  const factory: RoomSocketFactory = () => {
    const created = new PreviewSocket((message, active) => {
      if (message.type !== "host:transfer") return;
      setTimeout(() => {
        if (mode === "refused") {
          mode = "success";
          active.message({
            type: "error",
            code: "forbidden",
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
    setTimeout(() => {
      if (created.readyState !== 3) {
        created.readyState = 1;
        created.emit("open", {});
        created.message(snapshot());
      }
    }, 0);
    return created as unknown as WebSocket;
  };
  return {
    factory,
    // テストはサーバーからの非同期イベントをこのfixture専用境界へ送る。
    serverEvent(kind: "aba" | "recipient-left") {
      if (kind === "recipient-left") {
        members = members.filter((member) => member.userId !== PREVIEW_TARGET);
        socket?.message({ type: "member_left", userId: PREVIEW_TARGET });
      } else {
        socket?.message({
          type: "host:updated",
          hostUserId: PREVIEW_TARGET,
          hostRevision: ++hostRevision,
        });
        socket?.message({
          type: "host:updated",
          hostUserId: PREVIEW_HOST,
          hostRevision: ++hostRevision,
        });
      }
    },
  };
}

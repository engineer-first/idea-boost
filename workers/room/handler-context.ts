// WS メッセージ 1 件を処理する間だけ生きる使い捨てコンテキスト。
// RoomDO はハイバネーションでメモリから消える（次のイベントで constructor から
// 再構築される）ため、ここに状態を持たせず、必要な値は毎イベント SQL から導出する。
import type {
  ClientMessage,
  ServerMessage,
} from "../../contracts/room-protocol";
import type { RoomBroadcaster } from "./broadcast";

export type HandlerCtx = {
  sql: SqlStorage;
  // transactionSync（groups の一括保存）用。sql は storage.sql と同一。
  storage: DurableObjectStorage;
  userId: string;
  // 送信元ソケット。note:drag の送信者エコー除外（except）に使う。
  ws: WebSocket;
  // 送信元ソケットへの返信。
  reply: (message: ServerMessage) => void;
  // note:vote 系が持つ操作ID。RoomDO の reply が error に自動付与するため、
  // 深いハンドラでも失敗応答と楽観操作を確実に対応付けられる。
  voteOperationId?: string;
  broadcaster: RoomBroadcaster;
  // 結果ステップ遷移時に、接続を維持した各参加者へ受信者別の完全な状態を
  // 再送する。RoomDO が snapshot 構築を一元管理するためのコールバック。
  refreshSnapshots: () => void;
};

// 各ドメインモジュールが担当メッセージのハンドラ表を export し、
// room-do.ts が全ドメイン分を合成する。網羅性は合成先の型注釈
// MessageHandlers<ClientMessage["type"]> で強制される
// （メッセージ型を追加するとハンドラ漏れがコンパイルエラーになる）。
export type MessageHandlers<T extends ClientMessage["type"]> = {
  [K in T]: (
    ctx: HandlerCtx,
    message: Extract<ClientMessage, { type: K }>,
  ) => void | Promise<void>;
};

export function replyNotFound(ctx: HandlerCtx): void {
  ctx.reply({
    type: "error",
    code: "not-found",
    message: "付箋が見つかりませんでした。",
  });
}

export function replyForbidden(ctx: HandlerCtx): void {
  ctx.reply({
    type: "error",
    code: "forbidden",
    message: "この操作を行う権限がありません。",
  });
}

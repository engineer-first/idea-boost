// 本番で付箋の移動がどの理由でどれだけ失敗したかを Workers Logs で数える（#1401）。
// 決まった語だけを残し、付箋の本文・ルーム・利用者・操作の ID は含めない。
// Workers Logs はオブジェクト1つを渡すと項目ごとに絞り込める。

export const MOVE_FAILURE_EVENT = "note_move_failed";

export type MoveFailureOperation =
  | "start"
  | "preview"
  | "commit"
  | "inverse"
  | "lease";

export type MoveFailureKind =
  // 退室・閉鎖・工程の種類で、ボードを動かせない
  | "not-permitted"
  // 工程・マップの版が進んだ、座標の種類が工程と合わない
  | "phase-revision"
  | "map-revision"
  | "coordinate-space"
  // 付箋が消えた・非公開になった・別の工程の付箋になった
  | "note-unavailable"
  // 付箋の位置・公開の版が進んだ（相手が先に動かした）
  | "note-revision"
  // 相手が旧来のドラッグで掴んでいる
  | "note-dragging"
  // 相手の移動が保存待ちで付箋を押さえている
  | "note-locked"
  // 掴んでいる間に押さえが外れた
  | "lock-lost"
  | "rate-limited"
  // ID の使い回し・対象の重複・内容の違う再送
  | "invalid-request"
  // 同じ接続で別の移動を掴んでいる
  | "connection-busy"
  | "other-connection"
  | "save-failed"
  | "timer-stopped"
  // 取り消し（Undo/Redo）の前提が、ほかの人の変更で崩れた
  | "history-conflict"
  | "lease-expired";

export type MoveFailure = {
  operation: MoveFailureOperation;
  kind: MoveFailureKind;
};

export function logMoveFailure(
  failure: MoveFailure,
  status: "rejected" | "expired" = "rejected",
): void {
  console.info({
    event: MOVE_FAILURE_EVENT,
    operation: failure.operation,
    status,
    kind: failure.kind,
  });
}

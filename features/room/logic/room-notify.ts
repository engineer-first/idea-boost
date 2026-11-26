// ルーム内イベントの通知文言。sonner の toast を薄くラップし、
// この feature の通知文言をここで一元管理する（typo 防止と i18n 移行の足場）。
// 文言を持たない汎用エラー通知は @/lib/notify を使う。
"use client";

import { toast } from "sonner";

export const roomNotify = {
  multipleNoteMoveUnavailable(): void {
    toast("複数の付箋の移動は準備中です。1枚ずつ選択して動かしてください。", {
      id: "multiple-note-move-unavailable",
      duration: 4000,
      closeButton: true,
    });
  },
  cannotVoteExcludedNote(): void {
    toast.error(
      "除外済みの付箋には投票できません。残りの票は減っていません。候補の付箋にシールを貼ってください。",
      { id: "excluded-note-vote", duration: 4000, closeButton: true },
    );
  },
  canvasFitUnavailable(): void {
    toast.error(
      "ヒント・マイ付箋を閉じてから、もう一度「付箋全体を表示」を押してください。",
      { id: "canvas-fit-unavailable", duration: 4000, closeButton: true },
    );
  },
  memberJoined(name: string): void {
    toast(`${name} さんが参加しました`);
  },
  memberLeft(name: string): void {
    toast(`${name} さんが退出しました`);
  },
  // ほかの参加者がルームから外されたとき。外した本人には操作の結果として伝える。
  memberRemoved(name: string, removedByMe: boolean): void {
    toast(
      removedByMe
        ? `${name} さんをルームから外しました`
        : `${name} さんがルームから外されました`,
    );
  },
  // 自分がほかの参加者にルームから外されたとき。
  removedFromRoom(): void {
    toast("ほかの参加者にルームから外されました");
  },
  // 自分からルームを退出したとき。
  roomLeft(): void {
    toast("ルームから退出しました");
  },
};

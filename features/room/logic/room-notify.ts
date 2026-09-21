// ルーム内イベントの通知文言。sonner の toast を薄くラップし、
// この feature の通知文言をここで一元管理する（typo 防止と i18n 移行の足場）。
// 文言を持たない汎用エラー通知は @/lib/notify を使う。
"use client";

import { toast } from "sonner";

export const roomNotify = {
  memberJoined(name: string): void {
    toast(`${name} さんが参加しました`);
  },
  memberLeft(name: string): void {
    toast(`${name} さんが退出しました`);
  },
  // 自分からルームを退出したとき。
  roomLeft(): void {
    toast("ルームから退出しました");
  },
  // ホストがルームを解散したとき（他メンバー向け）。
  roomDisbanded(): void {
    toast("ルームが解散されました");
  },
  // ホスト自身がルームを解散したとき。
  roomDisbandedBySelf(): void {
    toast("ルームを解散しました");
  },
  cannotPublishNote() {
    toast.error("まだ共有できません");
  },
  noteExcluded(onUndo: () => void): void {
    toast("付箋を候補から外しました", {
      action: { label: "元に戻す", onClick: onUndo },
    });
  },
  bulkCandidatesExcluded(count: number, onUndo: () => void): void {
    toast(`${count}件の付箋を候補から外しました`, {
      action: { label: "まとめて元に戻す", onClick: onUndo },
    });
  },
  automaticallyExcludedCandidates(count: number, onUndo?: () => void): void {
    toast(
      onUndo
        ? `投票完了により0票の付箋${count}件を候補から外しました。必要なら戻せます`
        : `投票完了により0票の付箋${count}件を候補から外しました。ホストが戻せます`,
      onUndo
        ? {
            action: { label: "まとめて元に戻す", onClick: onUndo },
            duration: Number.POSITIVE_INFINITY,
          }
        : { duration: Number.POSITIVE_INFINITY },
    );
  },
};

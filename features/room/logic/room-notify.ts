// ルーム内イベントの通知文言。sonner の toast を薄くラップし、
// この feature の通知文言をここで一元管理する（typo 防止と i18n 移行の足場）。
// 文言を持たない汎用エラー通知は @/lib/notify を使う。
import { toast } from "sonner";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function message(
  t: Translate | undefined,
  key: string,
  fallback: string,
  values?: Record<string, string | number>,
): string {
  return t ? t(key, values) : fallback;
}

export const roomNotify = {
  multipleNoteMoveUnavailable(t?: Translate): void {
    toast(
      message(
        t,
        "multipleNoteMoveUnavailable",
        "複数の付箋の移動は準備中です。1枚ずつ選択して動かしてください。",
      ),
      {
        id: "multiple-note-move-unavailable",
        duration: 4000,
        closeButton: true,
      },
    );
  },
  cannotVoteExcludedNote(t?: Translate): void {
    toast.error(
      message(
        t,
        "cannotVoteExcludedNote",
        "除外済みの付箋には投票できません。残りの票は減っていません。候補の付箋にシールを貼ってください。",
      ),
      { id: "excluded-note-vote", duration: 4000, closeButton: true },
    );
  },
  canvasFitUnavailable(t?: Translate): void {
    toast.error(
      message(
        t,
        "canvasFitUnavailable",
        "ヒント・マイ付箋を閉じてから、もう一度「付箋全体を表示」を押してください。",
      ),
      { id: "canvas-fit-unavailable", duration: 4000, closeButton: true },
    );
  },
  memberJoined(name: string, t?: Translate): void {
    toast(message(t, "memberJoined", `${name} さんが参加しました`, { name }));
  },
  memberLeft(name: string, t?: Translate): void {
    toast(message(t, "memberLeft", `${name} さんが退出しました`, { name }));
  },
  // ほかの参加者がルームから外されたとき。外した本人には操作の結果として伝える。
  memberRemoved(name: string, removedByMe: boolean, t?: Translate): void {
    toast(
      removedByMe
        ? message(
            t,
            "memberRemovedByMe",
            `${name} さんをルームから外しました`,
            { name },
          )
        : message(t, "memberRemoved", `${name} さんがルームから外されました`, {
            name,
          }),
    );
  },
  // 自分がほかの参加者にルームから外されたとき。
  removedFromRoom(t?: Translate): void {
    toast(
      message(t, "removedFromRoom", "ほかの参加者にルームから外されました"),
    );
  },
  // 自分からルームを退出したとき。
  roomLeft(t?: Translate): void {
    toast(message(t, "roomLeft", "ルームから退出しました"));
  },
};

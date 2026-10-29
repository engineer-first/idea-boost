import { ROOM_DISPLAY_NAME_MAX_LENGTH } from "@/contracts/room-protocol";

export const guestIdentityFailure =
  "名前を登録できませんでした。入力は残っています。もう一度お試しください。";
export const guestIdentityUnavailable =
  "いまは名前を登録できません。時間をおいてもう一度お試しください。";
export const guestNameLabel = "仲間に表示される名前";
export const guestNameDescription = `${ROOM_DISPLAY_NAME_MAX_LENGTH}文字以内で、あとから変更できます。`;
export const guestIdentityNotice =
  "このブラウザで続きから使えます。別のブラウザや端末には引き継がれません。";
export const guestIdentitySubmitLabel = "この名前ではじめる";
export const guestIdentityPendingLabel = "準備中…";

// room-members feature の公開境界。外から使えるのはここに並ぶものだけ。
// NOTE_COLOR_STYLES はメンバー識別色（アバターと、そのメンバーが書く付箋の
// 両方に適用される）なので、付箋を描画する側（room feature）へも公開する。
export { NOTE_COLOR_NAMES, NOTE_COLOR_STYLES } from "./logic/note-color";
export { MemberAvatar } from "./molecules/member-avatar";
export { MemberSelection } from "./molecules/member-selection";
export {
  ROOM_MEMBERS_MAX_VISIBLE,
  RoomMembers,
} from "./organisms/room-members";

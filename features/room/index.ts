// room feature（ルーム内のリアルタイム体験）の公開境界。
// ロビー画面（RoomLobby）とボード画面（RoomBoard）の 2 つのコンテナを
// ページ（app/rooms/[id]/**）へ公開する。view・reducer・通知などの内部実装は
// feature 内に閉じる。
export { RoomBoard } from "./containers/room-board";
export { RoomLobby } from "./containers/room-lobby";
export type { RoomBoardInteractions } from "./logic/use-room-board-interactions";
export { RoomTimer } from "./organisms/room-timer";
export {
  RoomBoardView,
  type RoomBoardViewProps,
} from "./templates/room-board-view";
export { RoomLobbyView } from "./templates/room-lobby-view";

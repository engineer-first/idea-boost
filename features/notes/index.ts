// notes feature（付箋の作成・編集・移動・グルーピング）の公開境界。
// ボード上の付箋 UI（カード・グループ・ツールバー）と、サーバーイベントを
// 畳み込む状態 hook を room feature へ公開する。reducer の内部実装・影の計算
// などは feature 内に閉じる。

export type { Note } from "./logic/notes-reducer";
export type { RemoteNoteDrag } from "./logic/remote-note-drag";
export { useNoteGroups } from "./logic/use-note-groups";
export { useRoomNotes } from "./logic/use-room-notes";
export { NoteCard } from "./molecules/note-card";
export { NoteGroupCard } from "./molecules/note-group-card";
export { StickyNote } from "./molecules/sticky-note";
export { PrivateNotesToolbar } from "./organisms/private-notes-toolbar";

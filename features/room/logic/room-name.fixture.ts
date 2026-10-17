import type { RoomNameControls } from "./use-room-name";

export function buildRoomNameControls(
  overrides: Partial<RoomNameControls> = {},
): RoomNameControls {
  return {
    name: "J05",
    open: false,
    draft: "J05",
    pending: false,
    error: null,
    disabled: false,
    request: () => {},
    onDraftChange: () => {},
    onOpenChange: () => {},
    onConfirm: () => {},
    onClosed: () => {},
    ...overrides,
  };
}

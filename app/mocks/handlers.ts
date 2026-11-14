import { completedRoomHandlers } from "./completed-rooms";
import { outcomeReflectionHandlers } from "./outcome-reflection";
import { sharedOutcomeHandlers } from "./shared-outcomes";
export const handlers = [
  ...sharedOutcomeHandlers,
  ...completedRoomHandlers,
  ...outcomeReflectionHandlers,
];

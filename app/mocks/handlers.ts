import { completedRoomHandlers } from "./completed-rooms";
import { sharedOutcomeHandlers } from "./shared-outcomes";
export const handlers = [...sharedOutcomeHandlers, ...completedRoomHandlers];

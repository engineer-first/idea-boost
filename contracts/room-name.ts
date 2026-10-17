import { z } from "zod";
import { ROOM_CREATION_NAME_MAX } from "./room-creation";

export const ROOM_NAME_MAX_LENGTH = ROOM_CREATION_NAME_MAX;
export const RoomNameSchema = z
  .string()
  .trim()
  .min(1, "ルーム名を入力してください。")
  .max(
    ROOM_NAME_MAX_LENGTH,
    `ルーム名は${ROOM_NAME_MAX_LENGTH}文字以内で入力してください。`,
  );

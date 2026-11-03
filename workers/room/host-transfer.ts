import type { MessageHandlers } from "./handler-context";

// 古いクライアントの移譲要求は状態を変更せず拒否する。
export const hostHandlers: MessageHandlers<"host:transfer"> = {
  "host:transfer": (ctx) => {
    ctx.reply({
      type: "error",
      code: "forbidden",
      message: "この操作は利用できません。画面を更新してください。",
    });
  },
};

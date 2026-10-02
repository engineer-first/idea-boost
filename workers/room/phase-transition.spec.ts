import { env, runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import {
  parseServerMessage,
  type ServerMessage,
} from "../../contracts/room-protocol";
import { currentPhaseExpectation, runInRoomDO } from "../test-helpers";
import { HOST_ID_HEADER, USER_ID_HEADER } from "./room-do";

const hostId = "11111111-1111-4111-8111-111111111111";

describe("本文保存を待つ進行", () => {
  it("編集可能ステップからは最大2秒の猶予を永続化し、期限までphaseを変えない", async () => {
    const name = "phase-save-window";
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(name));
    await stub.initializeNewRoom(hostId, "Host");
    await stub.setPhase(buildPhaseStep(1), hostId);
    const response = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: hostId,
        [HOST_ID_HEADER]: hostId,
      },
    });
    const socket = response.webSocket;
    if (!socket) throw new Error("socket missing");
    socket.accept();
    await new Promise<void>((resolve) =>
      socket.addEventListener("message", () => resolve(), { once: true }),
    );
    const start = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    try {
      // 送信前のRPCやWSの配送時間を猶予へ加算しない。
      // 猶予の永続化後に届く保存要求の通知を待つ。
      const requested = new Promise<ServerMessage | null>((resolve) =>
        socket.addEventListener(
          "message",
          (event) => resolve(parseServerMessage(event.data)),
          { once: true },
        ),
      );
      socket.send(
        JSON.stringify({
          type: "phase:next",
          ...(await currentPhaseExpectation(name)),
        }),
      );
      const message = await requested;
      expect(message).toMatchObject({
        type: "phase:save-requested",
        deadlineAt: start + 2000,
      });
      expect(await stub.getPhase()).toEqual(buildPhaseStep(1));
      const deadline = await runInRoomDO(
        name,
        (_room, state) =>
          state.storage.sql
            .exec(
              "SELECT deadline_at FROM pending_phase_transition WHERE id = 1",
            )
            .one().deadline_at as number,
      );
      expect(deadline - start).toBe(2000);
      clock.mockReturnValue(deadline - 1);
      await runDurableObjectAlarm(stub);
      expect(await stub.getPhase()).toEqual(buildPhaseStep(1));
      clock.mockReturnValue(deadline);
      await runDurableObjectAlarm(stub);
      expect(await stub.getPhase()).toEqual(buildPhaseStep(2));
    } finally {
      clock.mockRestore();
      socket.close();
    }
  });
});

import { env, runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "../../contracts/phase.fixture";
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
    socket.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(name)),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await stub.getPhase()).toEqual(buildPhaseStep(1));
    const deadline = await runInRoomDO(
      name,
      (_room, state) =>
        state.storage.sql
          .exec("SELECT deadline_at FROM pending_phase_transition WHERE id = 1")
          .one().deadline_at as number,
    );
    expect(deadline - start).toBeGreaterThanOrEqual(1900);
    expect(deadline - start).toBeLessThanOrEqual(2100);
    await runInRoomDO(name, (_room, state) =>
      state.storage.sql.exec(
        "UPDATE pending_phase_transition SET deadline_at = ?1 WHERE id = 1",
        Date.now() - 1,
      ),
    );
    await runDurableObjectAlarm(stub);
    expect(await stub.getPhase()).toEqual(buildPhaseStep(2));
    socket.close();
  });
});

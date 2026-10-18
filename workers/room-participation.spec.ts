import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { issueCreationId } from "../contracts/room-creation";
import { TOKEN_AUDIENCE } from "../contracts/session";
import { signToken } from "../lib/session/token";

it("旧APIから別ルームを作成しても活動中の参加先を増やせない", async () => {
  const sub = "63111111-1111-4111-8111-111111111111";
  const token = await signToken(
    { sub, email: "single@example.test", name: "Single" },
    {
      secret: env.SESSION_SECRET,
      audience: TOKEN_AUDIENCE.session,
      expiresInSeconds: 600,
    },
  );
  const create = () =>
    exports.default.fetch("https://api.test/api/rooms", {
      method: "POST",
      headers: {
        Cookie: `idea_boost_session=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: issueCreationId().requestId,
        expectedPrincipal: sub,
      }),
    });
  expect((await create()).status).toBe(200);
  const second = await create();
  expect(second.status).toBe(409);
  expect(await second.json()).toMatchObject({
    reason: "confirmation_required",
  });
});

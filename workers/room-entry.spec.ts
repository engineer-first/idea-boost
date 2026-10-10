import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { TOKEN_AUDIENCE } from "../contracts/session";
import { signToken } from "../lib/session/token";

const principal = "11111111-1111-4111-8111-111111111111";
async function send(ticket: string, sub = principal) {
  const session = await signToken(
    { sub, email: "owner@example.test" },
    {
      secret: env.SESSION_SECRET,
      audience: TOKEN_AUDIENCE.session,
      expiresInSeconds: 600,
    },
  );
  return SELF.fetch("https://api.test/api/auth/consume-ticket", {
    method: "POST",
    headers: {
      Cookie: `idea_boost_session=${session}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ticket }),
  });
}
async function ticket(
  sub = principal,
  audience = "idea-boost:room-resume",
  expires = 600,
) {
  return signToken(
    {
      ticketId: crypto.randomUUID(),
      principal: sub,
      tabId: crypto.randomUUID(),
      state: crypto.randomUUID(),
      nonce: crypto.randomUUID(),
      operation: { kind: "return", roomId: crypto.randomUUID() },
    },
    { secret: env.SESSION_SECRET, audience, expiresInSeconds: expires },
  );
}
describe("再開情報の消費", () => {
  it("同じ署名済み情報の並行再送を一度だけ許す", async () => {
    const value = await ticket();
    const responses = await Promise.all([send(value), send(value)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("別本人を拒否する", async () =>
    expect(
      (await send(await ticket(), "22222222-2222-4222-8222-222222222222"))
        .status,
    ).toBe(403));
  it("期限切れを拒否する", async () =>
    expect((await send(await ticket(principal, undefined, -1))).status).toBe(
      403,
    ));
  it("用途の流用を拒否する", async () =>
    expect(
      (await send(await ticket(principal, TOKEN_AUDIENCE.session))).status,
    ).toBe(403));
  it("改ざんを拒否する", async () =>
    expect((await send(`${await ticket()}x`)).status).toBe(403));
});

describe("同じ入室の控え", () => {
  async function admission(
    audience = "idea-boost:room-admission",
    sessionExp = Math.floor(Date.now() / 1000) + 600,
  ) {
    return signToken(
      {
        ticketId: crypto.randomUUID(),
        principal,
        roomId: crypto.randomUUID(),
        sessionExp,
        stage: "board",
        ...(audience === "idea-boost:room-entry"
          ? { tabId: crypto.randomUUID() }
          : {}),
      },
      { secret: env.SESSION_SECRET, audience, expiresInSeconds: 600 },
    );
  }
  it("admissionの束縛も並行再送を一度だけ許す", async () => {
    const value = await admission();
    const responses = await Promise.all([send(value), send(value)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("新しいセッションへ控えを流用しない", async () => {
    expect(
      (
        await send(
          await admission(
            "idea-boost:room-admission",
            Math.floor(Date.now() / 1000) + 601,
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("画面遷移のticketも一度だけ消費する", async () => {
    const value = await admission("idea-boost:room-entry");
    expect((await send(value)).status).toBe(200);
    expect((await send(value)).status).toBe(409);
  });
});

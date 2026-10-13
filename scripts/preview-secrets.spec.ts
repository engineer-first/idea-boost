// @vitest-environment node
import { expect, it } from "vitest";
import { TOKEN_AUDIENCE, VerifiedSessionSchema } from "../contracts/session";
import { signToken, verifyToken } from "../lib/session/token";
import { previewProbeToken, previewSessionSecret } from "./preview-secrets.mts";

const master = "test-only-master-secret-at-least-32-characters";
const db = "11111111-1111-4111-8111-111111111111";
it("PRとD1が同じ間だけセッションを再利用し、他PR・開き直しには持ち込めない", async () => {
  const secret = previewSessionSecret(master, 587, db);
  const token = await signToken(
    {
      sub: "a1000000-0000-4000-8000-000000000001",
      email: "allowed@example.test",
      name: "検証用",
    },
    { secret, audience: TOKEN_AUDIENCE.session, expiresInSeconds: 60 },
  );
  expect(
    await verifyToken(token, VerifiedSessionSchema, {
      secret: previewSessionSecret(master, 587, db),
      audience: TOKEN_AUDIENCE.session,
    }),
  ).not.toBeNull();
  for (const other of [
    previewSessionSecret(master, 588, db),
    previewSessionSecret(master, 587, "22222222-2222-4222-8222-222222222222"),
  ])
    expect(
      await verifyToken(token, VerifiedSessionSchema, {
        secret: other,
        audience: TOKEN_AUDIENCE.session,
      }),
    ).toBeNull();
});
it("probeとセッションを分け、masterをPRのWorkerへ渡さない", () => {
  expect(previewSessionSecret(master, 587, db)).not.toBe(master);
  expect(previewProbeToken(master, 587)).not.toBe(master);
  expect(previewProbeToken(master, 587)).not.toBe(
    previewProbeToken(master, 588),
  );
  expect(previewProbeToken(master, 587)).not.toBe(
    previewSessionSecret(master, 587, db),
  );
  expect(() => previewSessionSecret("short", 587, db)).toThrow();
});

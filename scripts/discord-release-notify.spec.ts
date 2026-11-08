// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { notifyRelease } from "./discord-release-notify.mts";

const release = {
  tag: "prod-2026.11.08.1",
  body: "# 公開\n\n本番公開日時（UTC）：2026-11-08T00:00:00Z\n\n- **変更**：投票をやり直せます。\n  関連PR：[#1](https://github.com/example/pull/1)\n\n## 利用上の注意\n\n- 投票はリセットされます。\n\n[公開commit](https://github.com/example/commit/abc)\n<!-- release-history secret -->",
  existing: false,
  url: "https://github.com/engineer-first/idea-boost/releases/tag/prod-2026.11.08.1",
};
const env = {
  DISCORD_WEBHOOK_URL_RELEASE: "https://discord.com/api/webhooks/example",
  NEXT_PUBLIC_SITE_URL: "https://ideaboost.dev",
};

describe("リリース完了通知", () => {
  it("記録した版の要約・注意・本番とReleaseのリンクをメンションなしで送る", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await notifyRelease(release, env, send);
    const payload = JSON.parse(String(send.mock.calls[0][1]?.body));
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds[0].url).toBe(release.url);
    expect(payload.embeds[0].description).toContain(release.tag);
    expect(payload.embeds[0].description).toContain("投票をやり直せます。");
    expect(payload.embeds[0].description).toContain("投票はリセットされます。");
    expect(payload.embeds[0].description).toContain(
      "[本番を開く](https://ideaboost.dev)",
    );
    expect(payload.embeds[0].description).not.toMatch(
      /関連PR|公開commit|release-history/,
    );
  });
  it("プレビューでは送らず、Webhook未設定は明示してスキップする", async () => {
    const send = vi.fn<typeof fetch>();
    await notifyRelease({ ...release, url: undefined }, env, send);
    expect(await notifyRelease(release, {}, send)).toContain("未設定");
    expect(send).not.toHaveBeenCalled();
  });
  it("記録済みの版でも通知だけ再送できる", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await notifyRelease({ ...release, existing: true }, env, send);
    expect(send).toHaveBeenCalledOnce();
  });
  it("長い要約を制限内に収めても2つのリンクを残す", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await notifyRelease(
      { ...release, body: `- **変更**：${"長い変更".repeat(3000)}` },
      env,
      send,
    );
    const { description } = JSON.parse(String(send.mock.calls[0][1]?.body))
      .embeds[0];
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(description).toContain(release.url);
    expect(description).toContain("リリースノートで確認");
  });
  it("送信失敗を検出しWebhookや応答本文をエラーに含めない", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret", { status: 429 }));
    await expect(notifyRelease(release, env, send)).rejects.toThrow(
      "Discord通知に失敗しました（HTTP 429）",
    );
    send.mockRejectedValue(new Error(env.DISCORD_WEBHOOK_URL_RELEASE));
    await expect(notifyRelease(release, env, send)).rejects.toThrow(
      "Discord通知の通信に失敗しました",
    );
  });
});

it("Webhookの設定不備でも値をエラーに含めない", async () => {
  await expect(
    notifyRelease(
      release,
      { DISCORD_WEBHOOK_URL_RELEASE: "secret-invalid-url" },
      vi.fn(),
    ),
  ).rejects.toThrow("Discord通知の通信に失敗しました");
});

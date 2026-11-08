import type { ReleaseResult } from "./release-history.mts";

/** 公開本文を要約の正本にし、記録用の識別情報や運用リンクは配信しない。 */
export async function notifyRelease(
  release: ReleaseResult,
  env: Record<string, string | undefined>,
  send: typeof fetch = fetch,
): Promise<string> {
  if (!release.url) return "";
  const webhook = env.DISCORD_WEBHOOK_URL;
  if (!webhook)
    return "Discord通知：DISCORD_WEBHOOK_URL が未設定のためスキップしました。";
  const siteUrl = env.NEXT_PUBLIC_SITE_URL || "https://ideaboost.dev";
  const lines = release.body.split("\n");
  const start = lines.findIndex((line) => line.startsWith("- **"));
  const end = lines.findIndex((line) => line.startsWith("[公開commit]"));
  const summary =
    start < 0
      ? "変更内容はリリースノートで確認してください。"
      : lines
          .slice(start, end < 0 ? undefined : end)
          .filter(
            (line) =>
              !line.trimStart().startsWith("関連PR：") &&
              !line.startsWith("<!--"),
          )
          .join("\n")
          .trim();
  const heading = `\`${release.tag}\`\n\n**今回の変更**\n`;
  const links = `\n\n[本番を開く](${siteUrl}) · [リリースノート / タグ](${release.url})`;
  const omission = "\n…続きはリリースノートで確認してください。";
  const budget = 4096 - heading.length - links.length;
  const text =
    summary.length <= budget
      ? summary
      : summary.slice(0, budget - omission.length) + omission;
  let response: Response;
  try {
    const webhookUrl = new URL(webhook);
    // 保存完了を確認する。wait=false の成功応答だけでは保存されていない場合がある。
    webhookUrl.searchParams.set("wait", "true");
    response = await send(webhookUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: "✅ IdeaBoost の本番リリースが完了しました",
            url: release.url,
            description: heading + text + links,
            color: 0x57f287,
          },
        ],
      }),
    });
  } catch {
    throw new Error(
      "Discord通知の通信に失敗しました。Releaseは記録済みです。記録のみ再実行して通知を再送してください。",
    );
  }
  if (!response.ok)
    throw new Error(
      `Discord通知に失敗しました（HTTP ${response.status}）。Releaseは記録済みです。記録のみ再実行して通知を再送してください。`,
    );
  return "Discord通知：送信しました。";
}

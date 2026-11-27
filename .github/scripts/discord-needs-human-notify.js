// needs-human は「人が手を動かさないと進まない」合図。ループはオーナーの GitHub アカウントで動くため
// GitHub の通知はオーナー本人に届かない。Discord でオーナーだけをメンションして確実に知らせる。
function buildDiscordNeedsHumanPayload({
  kind,
  number,
  title,
  url,
  ownerDiscordId,
}) {
  const ownerId = /^\d+$/.test(ownerDiscordId ?? "") ? ownerDiscordId : null;
  return {
    content: ownerId
      ? `<@${ownerId}> 人の作業が要ります`
      : "人の作業が要ります",
    allowed_mentions: { parse: [], users: ownerId ? [ownerId] : [] },
    embeds: [
      {
        // Discord の embed のタイトルは 256 文字まで。超えると送信ごと失敗する。
        title: `#${number} ${title}`.slice(0, 256),
        url,
        description: `🆘 ${kind} に needs-human が付きました。止まった場所と用意してほしいものはコメントにあります`,
        color: 0xb60205,
      },
    ],
  };
}

module.exports = {
  buildDiscordNeedsHumanPayload,
};

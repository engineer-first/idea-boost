function buildDiscordAssignPayload({ number, title, url, assignee }) {
  return {
    embeds: [
      {
        title: `#${number} ${title}`,
        url,
        description: `👤 ${assignee} が着手します`,
        color: 0x5865f2,
      },
    ],
  };
}

module.exports = {
  buildDiscordAssignPayload,
};

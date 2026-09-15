function buildDiscordPayload({
  number,
  title,
  url,
  author,
  baseRef,
  headRef,
  changedFilesCount,
}) {
  return {
    embeds: [
      {
        title: `#${number} ${title}`,
        url,
        description: `\`${headRef}\` → \`${baseRef}\`\nby ${author}`,
        color: 0x57f287,
        fields: [
          {
            name: "変更ファイル数",
            value: `${changedFilesCount}件`,
          },
        ],
      },
    ],
  };
}

module.exports = {
  buildDiscordPayload,
};

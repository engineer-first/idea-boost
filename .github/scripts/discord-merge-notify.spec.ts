import { describe, expect, it } from "vitest";
import { buildDiscordPayload } from "./discord-merge-notify.js";

describe("buildDiscordPayload", () => {
  it("PR情報からDiscord Embed payloadを組み立てる", () => {
    const payload = buildDiscordPayload({
      number: 215,
      title: "PRマージ時にDiscordへ通知を送る",
      url: "https://github.com/engineer-first/idea-boost/pull/215",
      author: "junhat6",
      baseRef: "develop",
      headRef: "feature/215",
      changedFilesCount: 2,
    });

    expect(payload).toEqual({
      embeds: [
        {
          title: "#215 PRマージ時にDiscordへ通知を送る",
          url: "https://github.com/engineer-first/idea-boost/pull/215",
          description: "`feature/215` → `develop`\nby junhat6",
          color: 0x57f287,
          fields: [
            {
              name: "変更ファイル数",
              value: "2件",
            },
          ],
        },
      ],
    });
  });

  it("50件のような大きな件数でもそのまま表示する", () => {
    const payload = buildDiscordPayload({
      number: 217,
      title: "大きな変更",
      url: "https://github.com/engineer-first/idea-boost/pull/217",
      author: "junhat6",
      baseRef: "develop",
      headRef: "feature/217",
      changedFilesCount: 50,
    });

    expect(payload.embeds[0].fields[0]).toEqual({
      name: "変更ファイル数",
      value: "50件",
    });
  });
});

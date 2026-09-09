import { describe, expect, it } from "vitest";
import { buildDiscordAssignPayload } from "./discord-issue-assign-notify.js";

describe("buildDiscordAssignPayload", () => {
  it("issue情報からDiscord Embed payloadを組み立てる", () => {
    const payload = buildDiscordAssignPayload({
      number: 219,
      title: "issueがassignされたらDiscordへ通知する",
      url: "https://github.com/engineer-first/idea-boost/issues/219",
      assignee: "junhat6",
    });

    expect(payload).toEqual({
      embeds: [
        {
          title: "#219 issueがassignされたらDiscordへ通知する",
          url: "https://github.com/engineer-first/idea-boost/issues/219",
          description: "👤 junhat6 が着手します",
          color: 0x5865f2,
        },
      ],
    });
  });
});

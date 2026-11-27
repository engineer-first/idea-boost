import { describe, expect, it } from "vitest";
import { buildDiscordNeedsHumanPayload } from "./discord-needs-human-notify.js";

const base = {
  kind: "Issue",
  number: 1232,
  title: "Google Search ConsoleにLPを登録し、sitemapを送る",
  url: "https://github.com/engineer-first/idea-boost/issues/1232",
};

describe("buildDiscordNeedsHumanPayload", () => {
  it("オーナーの Discord ID があれば、本人だけをメンションする", () => {
    const payload = buildDiscordNeedsHumanPayload({
      ...base,
      ownerDiscordId: "123456789012345678",
    });

    expect(payload.content).toBe("<@123456789012345678> 人の作業が要ります");
    expect(payload.allowed_mentions).toEqual({
      parse: [],
      users: ["123456789012345678"],
    });
    expect(payload.embeds).toEqual([
      {
        title: "#1232 Google Search ConsoleにLPを登録し、sitemapを送る",
        url: "https://github.com/engineer-first/idea-boost/issues/1232",
        description:
          "🆘 Issue に needs-human が付きました。止まった場所と用意してほしいものはコメントにあります",
        color: 0xb60205,
      },
    ]);
  });

  it("オーナーの Discord ID が無いときは、誰もメンションしない", () => {
    const payload = buildDiscordNeedsHumanPayload({ ...base, kind: "PR" });

    expect(payload.content).toBe("人の作業が要ります");
    expect(payload.allowed_mentions).toEqual({ parse: [], users: [] });
    expect(payload.embeds[0].description).toContain("PR に needs-human");
  });

  it("数字でない ID はメンションに使わない", () => {
    const payload = buildDiscordNeedsHumanPayload({
      ...base,
      ownerDiscordId: "@everyone",
    });

    expect(payload.content).toBe("人の作業が要ります");
    expect(payload.allowed_mentions.users).toEqual([]);
  });
});

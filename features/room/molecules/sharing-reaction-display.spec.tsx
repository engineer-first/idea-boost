import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SharingReactionDisplay } from "./sharing-reaction-display";

describe("SharingReactionDisplay", () => {
  it.each([
    ["like", "いいね"],
    ["clap", "拍手"],
    ["surprised", "おお！"],
    ["insight", "なるほど"],
    ["question", "どうして？"],
  ] as const)(
    "受信した%sを対応する画像と読み上げ名で表示する",
    (kind, label) => {
      render(
        <SharingReactionDisplay
          reactions={[{ id: "received-reaction", kind, slot: 0 }]}
        />,
      );
      const reaction = screen.getByRole("img", { name: label });
      const image = within(reaction).getByRole("presentation");
      expect(decodeURIComponent(image.getAttribute("src") ?? "")).toContain(
        `/reactions/${kind}-3d.webp`,
      );
    },
  );
});

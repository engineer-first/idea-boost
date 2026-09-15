import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  IDEA_GUIDE_EXAMPLES,
  IDEA_GUIDE_HEADING,
  IDEA_GUIDE_HINTS,
} from "../logic/idea-guide-content";
import { IdeaGuidePanel } from "./idea-guide-panel";

describe("IdeaGuidePanel", () => {
  it("見出し・説明・発想のヒント・考え方の例を表示する", () => {
    render(<IdeaGuidePanel onHintSelect={vi.fn()} />);

    expect(screen.getByText(IDEA_GUIDE_HEADING)).toBeInTheDocument();
    expect(
      screen.getByText(
        "正しさよりも数を意識して、思いついたことを1枚に1つ書こう。",
      ),
    ).toBeInTheDocument();
    for (const hint of IDEA_GUIDE_HINTS) {
      expect(screen.getByRole("button", { name: hint })).toBeInTheDocument();
    }
    for (const example of IDEA_GUIDE_EXAMPLES) {
      expect(screen.getByText(example)).toBeInTheDocument();
    }
  });

  it("発想のヒントを選ぶと文言つきで onHintSelect を呼ぶ", async () => {
    const onHintSelect = vi.fn();
    render(<IdeaGuidePanel onHintSelect={onHintSelect} />);

    await userEvent.click(
      screen.getByRole("button", { name: IDEA_GUIDE_HINTS[0] }),
    );

    expect(onHintSelect).toHaveBeenCalledWith(IDEA_GUIDE_HINTS[0]);
  });
});

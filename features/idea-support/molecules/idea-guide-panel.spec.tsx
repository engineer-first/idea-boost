import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  IDEA_GUIDE_EXAMPLES,
  IDEA_GUIDE_HINTS,
} from "../logic/idea-guide-content";
import { IdeaGuidePanel } from "./idea-guide-panel";

describe("IdeaGuidePanel", () => {
  it("補足を開いたときだけ考え方の例を表示し、開閉では付箋を作らない", async () => {
    const user = userEvent.setup();
    const onHintSelect = vi.fn();
    render(<IdeaGuidePanel onHintSelect={onHintSelect} />);
    const toggle = screen.getByRole("button", { name: "ほかの考え方を見る" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    for (const example of IDEA_GUIDE_EXAMPLES) {
      expect(screen.queryByText(example)).not.toBeVisible();
    }
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const example of IDEA_GUIDE_EXAMPLES) {
      expect(screen.getByText(example)).toBeVisible();
    }
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(onHintSelect).not.toHaveBeenCalled();
  });

  it.each(IDEA_GUIDE_HINTS)(
    "%sを選ぶと同じ書き出しを一枚分だけ返す",
    async (hint) => {
      const onHintSelect = vi.fn();
      render(<IdeaGuidePanel onHintSelect={onHintSelect} />);
      await userEvent.click(screen.getByRole("button", { name: hint }));
      expect(onHintSelect).toHaveBeenCalledExactlyOnceWith(hint);
    },
  );

  it("作成できないときも補足は読めるが、どの書き出しも選べない", async () => {
    const onHintSelect = vi.fn();
    render(<IdeaGuidePanel disabled onHintSelect={onHintSelect} />);
    for (const hint of IDEA_GUIDE_HINTS) {
      const button = screen.getByRole("button", { name: hint });
      expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    await userEvent.click(
      screen.getByRole("button", { name: "ほかの考え方を見る" }),
    );
    expect(screen.getByText(IDEA_GUIDE_EXAMPLES[0])).toBeVisible();
    expect(onHintSelect).not.toHaveBeenCalled();
  });
});

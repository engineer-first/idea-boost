import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ideaSupportContents } from "../logic/idea-support-content";

import { IdeaSupportSidebarContent } from "./idea-support-sidebar-content";

describe("IdeaSupportSidebarContent", () => {
  it.each(ideaSupportContents)(
    "$labelは代表の観点だけ表示し、残りを開閉できる",
    async (item) => {
      const user = userEvent.setup();
      render(<IdeaSupportSidebarContent defaultContentId={item.id} />);
      expect(screen.getByText(item.content[0])).toBeVisible();
      for (const text of item.content.slice(1)) {
        expect(screen.queryByText(text)).not.toBeVisible();
      }
      const toggle = screen.getByRole("button", { name: /ほかの観点を見る/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      await user.click(toggle);
      for (const text of item.content)
        expect(screen.getByText(text)).toBeVisible();
      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    },
  );

  it("使い方は観点の前に、決定した問いと呼び分けて示す", () => {
    render(<IdeaSupportSidebarContent />);
    const description = screen.getByText(/気になる観点を1つ選び/);
    expect(description).toHaveTextContent("決定した問いに当てはめよう");
    expect(
      description.compareDocumentPosition(
        screen.getByText(ideaSupportContents[0].content[0]),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("カテゴリを切り替えて戻っても、選んだ補足の開閉状態を保つ", async () => {
    const user = userEvent.setup();
    render(<IdeaSupportSidebarContent />);
    await user.click(screen.getByRole("button", { name: /ほかの観点を見る/ }));
    await user.click(screen.getByRole("tab", { name: "SCAMPER" }));
    expect(
      screen.getByRole("button", { name: /ほかの観点を見る/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("tab", { name: "オズボーン" }));
    expect(
      screen.getByRole("button", { name: /ほかの観点を閉じる/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(ideaSupportContents[0].content[7])).toBeVisible();
  });

  it.each([
    ["loading", "発想支援を読み込んでいます"],
    ["empty", "発想支援コンテンツはありません"],
    ["error", "発想支援コンテンツを表示できません"],
  ] as const)("%s状態を表示する", (status, message) => {
    render(<IdeaSupportSidebarContent status={status} />);

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it.each([
    ["osborn", "オズボーンのチェックリスト"],
    ["scamper", "SCAMPER法"],
    ["reverse", "逆転発想で考える"],
    ["industry", "他業界からヒントを探す"],
  ] as const)("%sのコンテンツを個別に表示できる", (defaultContentId, title) => {
    render(<IdeaSupportSidebarContent defaultContentId={defaultContentId} />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });
});

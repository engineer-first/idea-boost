import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IdeaSupportSidebarContent } from "./idea-support-sidebar-content";

describe("IdeaSupportSidebarContent", () => {
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

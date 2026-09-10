import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DECIDED_ISSUE_LABEL } from "../logic/hmw-content";
import { HmwDecidedIssueBanner } from "./hmw-decided-issue-banner";
import { LONG_DECIDED_ISSUE } from "./hmw-decided-issue-banner.fixture";

describe("HmwDecidedIssueBanner", () => {
  it("コンパクト表示でも全文ボタンから長い決定内容を確認できる", () => {
    render(<HmwDecidedIssueBanner content={LONG_DECIDED_ISSUE} compact />);
    expect(screen.getByText(LONG_DECIDED_ISSUE)).toHaveClass("truncate");
    fireEvent.click(
      screen.getByRole("button", {
        name: `${DECIDED_ISSUE_LABEL}の全文を表示`,
      }),
    );
    expect(
      within(screen.getByRole("dialog")).getByText(LONG_DECIDED_ISSUE),
    ).toBeVisible();
  });
  it("ラベルと決定課題の本文を表示する", () => {
    render(<HmwDecidedIssueBanner content="宿題を後回しにしてしまう" />);

    expect(screen.getByText(DECIDED_ISSUE_LABEL)).toBeInTheDocument();
    expect(screen.getByText("宿題を後回しにしてしまう")).toBeInTheDocument();
  });

  it("長文でも省略せず全文を表示する", () => {
    render(<HmwDecidedIssueBanner content={LONG_DECIDED_ISSUE} />);

    const contentEl = screen.getByText(LONG_DECIDED_ISSUE);
    expect(contentEl).not.toHaveClass("truncate");
    expect(contentEl).toHaveClass("whitespace-normal");
  });
});

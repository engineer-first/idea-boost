import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IdeaSupportSidebar } from "./idea-support-sidebar";

describe("IdeaSupportSidebar", () => {
  it("必須表示では初期状態から4種の発想支援コンテンツを表示し、閉じられない", () => {
    render(<IdeaSupportSidebar mode="required" />);

    expect(screen.getByText("オズボーンのチェックリスト")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "発想支援を閉じる" }),
    ).not.toBeInTheDocument();
  });

  it("任意表示では参加者が発想支援コンテンツを開閉できる", () => {
    render(<IdeaSupportSidebar mode="optional" />);

    fireEvent.click(screen.getByRole("button", { name: "発想支援を開く" }));
    expect(screen.getByText("オズボーンのチェックリスト")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "発想支援を閉じる" }));
    expect(
      screen.queryByText("オズボーンのチェックリスト"),
    ).not.toBeInTheDocument();
  });

  it("初期状態では発想支援コンテンツを表示しない", () => {
    render(<IdeaSupportSidebar />);

    expect(
      screen.queryByText("オズボーンのチェックリスト"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "発想支援を開く" }),
    ).toBeInTheDocument();
  });

  it("開くボタンで発想支援コンテンツを表示する", () => {
    render(<IdeaSupportSidebar />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "発想支援を開く",
      }),
    );

    expect(screen.getByText("オズボーンのチェックリスト")).toBeInTheDocument();
  });

  it("開いた状態から閉じるボタンで発想支援コンテンツを非表示にする", () => {
    render(<IdeaSupportSidebar />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "発想支援を開く",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "発想支援を閉じる",
      }),
    );

    expect(
      screen.queryByText("オズボーンのチェックリスト"),
    ).not.toBeInTheDocument();
  });

  it("閉じた状態から開くボタンで再表示する", () => {
    render(<IdeaSupportSidebar />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "発想支援を開く",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "発想支援を閉じる",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "発想支援を開く",
      }),
    );

    expect(screen.getByText("オズボーンのチェックリスト")).toBeInTheDocument();
  });
});

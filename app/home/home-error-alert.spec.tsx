import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeErrorAlert } from "./home-error-alert";

describe("HomeErrorAlert", () => {
  it("role=alert でメッセージを表示する", () => {
    render(
      <HomeErrorAlert message="参加できるルームが見つかりません。ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "参加できるルームが見つかりません。ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。",
    );
  });
});

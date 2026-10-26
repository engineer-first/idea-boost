import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LandingFaqSection } from "./landing-faq-section";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("FAQへのページ内リンク", () => {
  it("所要時間のハッシュが変わると対象の回答を開く", () => {
    const { container } = render(<LandingFaqSection />);
    const details = container
      .querySelector("#landing-duration")
      ?.closest("details");
    expect(details).not.toHaveAttribute("open");
    act(() => {
      window.history.replaceState(null, "", "#landing-duration");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(details).toHaveAttribute("open");
    expect(container.querySelectorAll("details[open]")).toHaveLength(1);
  });

  it("所要時間のハッシュ付きURLで初期表示すると対象の回答を開く", () => {
    window.history.replaceState(null, "", "#landing-duration");
    const { container } = render(<LandingFaqSection />);
    expect(
      container.querySelector("#landing-duration")?.closest("details"),
    ).toHaveAttribute("open");
    expect(container.querySelectorAll("details[open]")).toHaveLength(1);
  });
});

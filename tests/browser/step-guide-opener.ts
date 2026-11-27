import type { Locator, Page } from "playwright";

// 進め方の入口。中央のステップバーが出る 900px 以上は今のステップ、狭い幅は左上の「進め方」。
export function stepGuideOpener(page: Page, width: number): Locator {
  return width >= 900
    ? page.getByTestId("phase-step-trail-guide")
    : page.getByRole("button", { name: "進め方", exact: true });
}

// 全体の流れの入口。900px 以上は中央のステップバーのフェーズ名、狭い幅は左上の現在地カード。
export function flowOpener(page: Page, width: number): Locator {
  return width >= 900
    ? page.getByTestId("phase-step-trail-phase")
    : page.getByTestId("board-location-trigger");
}

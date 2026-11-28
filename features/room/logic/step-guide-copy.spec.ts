import { describe, expect, it } from "vitest";
import {
  getStepGuideReferenceSlides,
  STEP_GUIDE_DIAGRAM_COPY,
} from "./step-guide-copy";

describe("共有ステップの案内", () => {
  it.each(["1-2", "2-2", "3-2"])(
    "%s は画面に無いボタン名を出さず、交代を「次の人へ」で案内する",
    (phaseKey) => {
      const text = getStepGuideReferenceSlides(phaseKey)
        .map((slide) =>
          [slide.title, slide.description, slide.illustrationAlt].join(" "),
        )
        .join(" ");
      expect(text).not.toContain("「できた！」");
      expect(text).toContain("「次の人へ」");
    },
  );

  it("共有の図で交代に押すボタンは「次の人へ」と示す", () => {
    expect(STEP_GUIDE_DIAGRAM_COPY.handOffButton).toBe("次の人へ");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SCAMPER_QUESTION_EXAMPLES,
  STEP_GUIDE_DIAGRAM_COPY,
} from "../logic/step-guide-copy";
import { StepGuideIllustration } from "./step-guide-illustration";

describe("StepGuideIllustration", () => {
  it("例の付箋は「だろ／う？」のように語の途中で折り返さない", () => {
    render(
      <StepGuideIllustration kind="question-purpose" alt="問いの考え方" />,
    );

    expect(
      screen.getByText(STEP_GUIDE_DIAGRAM_COPY.questionTemplate),
    ).toHaveClass("[word-break:auto-phrase]");
  });

  it("SCAMPER の例も、問いと視点の説明を語の途中で折り返さない", () => {
    render(<StepGuideIllustration kind="question-example" alt="問いの例" />);

    for (const example of SCAMPER_QUESTION_EXAMPLES) {
      expect(screen.getByText(example.question)).toHaveClass(
        "[word-break:auto-phrase]",
      );
      expect(screen.getByText(example.prompt)).toHaveClass(
        "[word-break:auto-phrase]",
      );
    }
  });
});

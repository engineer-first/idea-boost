import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  getStepGuideSlides,
  type StepGuideDiagramKind,
} from "../logic/step-guide-copy";
import { StepGuideIllustration } from "./step-guide-illustration";

const meta = {
  title: "Room/StepGuideIllustration",
  component: StepGuideIllustration,
  args: { kind: "timer", alt: "タイマーを見ながら付箋に取り組む様子" },
} satisfies Meta<typeof StepGuideIllustration>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Timer: Story = {};
export const AllDiagrams: Story = {
  render: () => (
    <div className="mx-auto grid max-w-3xl gap-8">
      {["1-2", "1-3", "1-4", "1-5", "2-1", "3-1", "3-3"].flatMap((phaseKey) =>
        getStepGuideSlides(phaseKey).map((slide) => (
          <figure key={slide.illustration}>
            <figcaption className="mb-3 font-semibold">
              {phaseKey}：{slide.title}
            </figcaption>
            <StepGuideIllustration
              kind={slide.illustration as StepGuideDiagramKind}
              alt={slide.illustrationAlt}
            />
          </figure>
        )),
      )}
    </div>
  ),
};

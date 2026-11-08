import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  reflectionAnalysisFixture,
  reflectionResponseFixture,
} from "@/contracts/outcome-reflection.fixture";
import { OutcomeReflectionView } from "./outcome-reflection-view";

const meta = {
  title: "Room/OutcomeReflection",
  component: OutcomeReflectionView,
  args: {
    open: true,
    data: reflectionResponseFixture(),
    busy: null,
    error: null,
    artifact: "利用の流れを示す画面モック",
    copy: "idle",
    onStart: () => {},
    onArtifact: () => {},
    onGenerate: () => {},
    onCopy: () => {},
  },
} satisfies Meta<typeof OutcomeReflectionView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Start: Story = { args: { open: false, data: null } };
export const Loading: Story = { args: { data: null, busy: "analysis" } };
export const Failed: Story = {
  args: { data: null, error: "AIの生成に失敗しました。再試行できます。" },
};
export const NoRecommendation: Story = {
  args: {
    data: reflectionResponseFixture({
      analysis: reflectionAnalysisFixture({
        recommendation: null,
        alternatives: [],
      }),
    }),
    artifact: "",
  },
};
export const Prompt: Story = {
  args: {
    data: reflectionResponseFixture({
      prompt: {
        artifact: "説明スライド",
        content:
          "採用案を説明する5枚のスライドを作成してください。\n課題、問い、利用場面、提案、確認したい前提を順に示してください。",
        generatedAt: 1794100000000,
      },
    }),
  },
};

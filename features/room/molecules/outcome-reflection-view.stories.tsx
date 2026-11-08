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
    artifact: "聞くことのリスト",
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
        artifact: "聞くことのリスト",
        content:
          "空きコマに相手を探して困った経験があるかを確かめる質問リストを作成してください。\n最近の実体験を聞き、アプリへの賛否を誘導しないでください。",
        generatedAt: 1794100000000,
      },
    }),
  },
};

export const Assumption: Story = { args: { chapter: "assumption" } };
export const Experiment: Story = { args: { chapter: "experiment" } };

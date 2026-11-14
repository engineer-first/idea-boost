import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  reflectionPlanFixture,
  reflectionResponseFixture,
  reflectionSharedFixture,
} from "@/contracts/outcome-reflection.fixture";
import { OutcomeReflectionView } from "./outcome-reflection-view";

const meta = {
  title: "Room/OutcomeReflection",
  component: OutcomeReflectionView,
  args: {
    section: "research",
    data: reflectionResponseFixture(),
    context: reflectionSharedFixture().context,
    artifact: "質問リスト",
    step: 0,
    editing: false,
    confirming: false,
    busy: null,
    error: null,
    copy: "idle",
    onOpen: () => {},
    onClose: () => {},
    onRefresh: () => {},
    onStep: () => {},
    onContext: () => {},
    onEdit: () => {},
    onCancelEdit: () => {},
    onResearch: () => {},
    onConfirm: () => {},
    onConfirming: () => {},
    onArtifact: () => {},
    onGenerate: () => {},
    onCompetition: () => {},
    onCopy: () => {},
  },
} satisfies Meta<typeof OutcomeReflectionView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Start: Story = { args: { section: null, data: null } };
export const Empty: Story = {
  args: {
    data: reflectionResponseFixture({
      shared: reflectionSharedFixture({
        revision: 0,
        result: null,
        context: { audience: "", situation: "" },
        generatedAt: null,
      }),
    }),
  },
};
export const Loading: Story = { args: { data: null, busy: "load" } };
export const Generating: Story = { args: { busy: "research" } };
export const Failed: Story = {
  args: {
    error: "生成に失敗しました。表示中の手順はそのままに、もう一度試せます。",
  },
};
export const Questions: Story = {
  args: {
    data: reflectionResponseFixture({
      shared: reflectionSharedFixture({
        result: {
          kind: "questions",
          questions: [
            { field: "audience", question: "誰の困りごとを調べたいですか？" },
            { field: "situation", question: "どんなときに困っていますか？" },
          ],
        },
        context: { audience: "", situation: "" },
      }),
    }),
    context: { audience: "", situation: "" },
  },
};
export const LastStep: Story = { args: { step: 2 } };
export const EditConditions: Story = { args: { editing: true } };
export const ConfirmUpdate: Story = {
  args: { editing: true, confirming: true },
};
export const Conflict: Story = {
  args: {
    error: "共通の調査手順が更新されています。最新版を取得してください。",
  },
};
export const NoRecommendation: Story = {
  args: {
    section: "artifact",
    data: reflectionResponseFixture({
      shared: reflectionSharedFixture({
        result: reflectionPlanFixture({
          recommendation: null,
          alternatives: [],
        }),
      }),
    }),
    artifact: "",
  },
};
export const Prompt: Story = {
  args: {
    section: "artifact",
    data: reflectionResponseFixture({
      selectedArtifact: "質問リスト",
      prompt: {
        revision: 1,
        artifact: "質問リスト",
        content:
          "最近勉強相手を探した実体験を聞く、中立的な質問リストを作成してください。",
        generatedAt: 1794100000000,
      },
    }),
  },
};
export const Competition: Story = {
  args: {
    section: "competition",
    data: reflectionResponseFixture({
      competitionPrompt:
        "同じ課題を解く製品・サービスと、現在の対処法・代替手段を調べてください。出典URLと確認日を示し、事実・推測・不明点を分けてください。",
    }),
  },
};

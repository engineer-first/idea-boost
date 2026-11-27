import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GUIDES } from "../logic/guide-content";
import { GuideArticleView } from "./guide-article-view";

const meta = {
  title: "Landing/GuideArticleView",
  component: GuideArticleView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-screen flex-col">
        <Story />
      </div>
    ),
  ],
  args: { guide: GUIDES[0] },
} satisfies Meta<typeof GuideArticleView>;
export default meta;

export const HackathonIdea: StoryObj<typeof meta> = {};

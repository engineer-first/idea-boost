import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import tokensCss from "../../app/design-tokens.css?raw";
import globalsCss from "../../app/globals.css?raw";
import { readDesignTokens } from "./design-tokens";
import { DesignTokensView } from "./design-tokens-view";

// DESIGN.md のトークン一覧。npm run gen:design-tokens が生成した CSS と、
// Tailwind へ橋渡しする globals.css を読むため、DESIGN.md の変更に追従する。
const meta: Meta<typeof DesignTokensView> = {
  title: "Design/Tokens",
  component: DesignTokensView,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof DesignTokensView>;

export const Tokens: Story = {
  args: {
    tokens: readDesignTokens(tokensCss, globalsCss),
  },
};

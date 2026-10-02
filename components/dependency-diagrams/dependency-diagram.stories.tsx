import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DependencyDiagram } from "./dependency-diagram";

// features / app の実測依存図。npm run deps:diagrams（storybook 起動時に
// 自動実行）が import 文の解析から生成した mermaid テキストを表示する。
// ディレクトリ構造では読めない「誰が誰を使うか」（データフロー）が見える。
// Chromatic が develop との見た目の差分を検出するため、依存の追加・削除を
// PR 上でビジュアルに確認できる。
const meta: Meta<typeof DependencyDiagram> = {
  title: "Dependencies/DependencyDiagram",
  component: DependencyDiagram,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof DependencyDiagram>;

export const FeaturesOverview: Story = {
  args: {
    title: "features 全体",
    description:
      "app と feature 間の依存の実測図。AGENTS.md の一方通行ルール（ast-grep が強制）が実際にどう使われているかが見える。",
    src: "/dependency-diagrams/features-overview.mmd",
  },
};

export const Room: Story = {
  args: {
    title: "room",
    description:
      "ルーム内体験のオーケストレーター。ui/ の画面が logic/ の接続・状態 hook を束ね、notes ほか 4 feature を組み合わせる。",
    src: "/dependency-diagrams/feature-room.mmd",
  },
};

export const Notes: Story = {
  args: {
    title: "notes",
    description: "付箋の作成・編集・移動・グルーピング。",
    src: "/dependency-diagrams/feature-notes.mmd",
  },
};

export const RoomMembers: Story = {
  args: {
    title: "room-members",
    description: "メンバー一覧とアバター、メンバー識別色。",
    src: "/dependency-diagrams/feature-room-members.mmd",
  },
};

export const DotVote: Story = {
  args: {
    title: "dot-vote",
    description: "付箋への投票 UI。表示部品のみの単層 feature。",
    src: "/dependency-diagrams/feature-dot-vote.mmd",
  },
};

export const Invite: Story = {
  args: {
    title: "invite",
    description: "招待 URL / コードの提示とコピー。",
    src: "/dependency-diagrams/feature-invite.mmd",
  },
};

export const RoomLifecycle: Story = {
  args: {
    title: "room-lifecycle",
    description: "ルームの作成・参加フロー。",
    src: "/dependency-diagrams/feature-room-lifecycle.mmd",
  },
};

export const Auth: Story = {
  args: {
    title: "auth",
    description: "ログイン UI と認証フローの配線。",
    src: "/dependency-diagrams/feature-auth.mmd",
  },
};

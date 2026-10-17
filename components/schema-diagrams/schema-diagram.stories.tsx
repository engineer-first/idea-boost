import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SchemaDiagram } from "./schema-diagram";

// D1 / RoomDO のER図。npm run db:schema:diagrams（storybook 起動時に自動実行）
// がtblsでマイグレーションから生成したSVGを表示する。
// PRのStorybook Publishから、そのコミットのスキーマを確認できる。
const meta: Meta<typeof SchemaDiagram> = {
  title: "Schema/SchemaDiagram",
  component: SchemaDiagram,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof SchemaDiagram>;

export const D1: Story = {
  args: {
    title: "D1 (lobby)",
    description:
      "招待コード → ルーム解決のためのディレクトリ。ルームの中身はここには含まれない。",
    src: "/schema-diagrams/d1/schema.svg",
  },
};

export const RoomDO: Story = {
  args: {
    title: "RoomDO (room内部)",
    description:
      "ルーム1つにつき1つ生成される SQLite-backed Durable Object の内部スキーマ。",
    src: "/schema-diagrams/room-do/schema.svg",
  },
};

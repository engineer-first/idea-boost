import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { launchFontCss } from "./idea-boost-launch";
import { LaunchView } from "./launch-view";
import "./launch.css";

const meta = {
  title: "Remotion/IdeaBoostLaunch",
  component: LaunchView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <>
        <style>{launchFontCss((path) => `/${path}`)}</style>
        <div style={{ width: 960, height: 540, overflow: "hidden" }}>
          <div style={{ transform: "scale(.5)", transformOrigin: "0 0" }}>
            <Story />
          </div>
        </div>
      </>
    ),
  ],
  args: { frame: 90 },
} satisfies Meta<typeof LaunchView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Blank: Story = {};
export const Problems: Story = { args: { frame: 392 } };
export const Brand: Story = { args: { frame: 500 } };
export const RoomCreation: Story = { args: { frame: 579 } };
export const Lobby: Story = { args: { frame: 650 } };
export const Flow: Story = { args: { frame: 800 } };
export const Private: Story = { args: { frame: 995 } };
export const Sharing: Story = { args: { frame: 1195 } };
export const Hints: Story = { args: { frame: 1470 } };
export const Mapping: Story = { args: { frame: 1700 } };
export const StealthVote: Story = { args: { frame: 1950 } };
export const Results: Story = { args: { frame: 2070 } };
export const Decision: Story = { args: { frame: 2240 } };
export const Closing: Story = { args: { frame: 2440 } };

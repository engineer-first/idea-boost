import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { launchFontCss } from "./idea-boost-launch";
import { LaunchBoard, LaunchNote, LaunchPrivateDock } from "./launch-product";
import { getLaunchState } from "./launch-state";
import "./launch.css";

const meta = {
  title: "Remotion/LaunchProduct",
  component: LaunchBoard,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <>
        <style>{launchFontCss((path) => `/${path}`)}</style>
        <div
          className="launch-root dark"
          style={{ transform: "scale(.5)", transformOrigin: "0 0" }}
        >
          <Story />
        </div>
      </>
    ),
  ],
  args: { state: getLaunchState(1700) },
} satisfies Meta<typeof LaunchBoard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Board: Story = {};
export const PrivateDock: Story = {
  render: () => <LaunchPrivateDock state={getLaunchState(995)} />,
};
export const Note: Story = {
  render: () => <LaunchNote note={getLaunchState(1960).board.notes[0]} />,
};

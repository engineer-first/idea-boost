import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef } from "react";
import { fn, userEvent, within } from "storybook/test";
import {
  FeedbackPanel,
  FeedbackPrompt,
  useFeedback,
} from "@/features/feedback";
import { RoomOutcomeView } from "./room-outcome-view";

const meta = {
  title: "Room/RoomOutcomeView",
  component: RoomOutcomeView,
  parameters: { layout: "fullscreen" },
  args: {
    connected: true,
    outcome: {
      issue: "空きコマに一緒に勉強する仲間が見つからない",
      hmw: "どうすれば、空きコマに気軽に学び合う仲間と出会えるだろう？",
      idea: "空きコマ勉強マッチ：科目・空き時間の募集にワンタップで参加",
    },
    onBackToBoard: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomOutcomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = {};
export const LongContent: Story = {
  args: {
    outcome: {
      issue:
        "初めて参加する学生が意見を出しづらい。\n" +
        "発言の機会が限られ、自分の考えが十分に伝わらない。".repeat(40),
      hmw:
        "どうすれば全員が安心してアイデアを共有できるだろうか？\n" +
        "初めて参加した人の目線で考える。".repeat(40),
      idea: `${"最初の一分は匿名でアイデアを書く。気になる案から話し始める。\n".repeat(100).slice(0, 1996)}末尾確認`,
    },
  },
};
export const Disconnected: Story = { args: { connected: false } };
export const MissingDecision: Story = { args: { outcome: null } };
export const Revisit: Story = {
  args: { authorized: true, connected: false, onBackToBoard: undefined },
};

export const AccessUnavailable: Story = {
  args: { authorized: false, connected: false, onBackToBoard: undefined },
};

async function attemptCopy(
  canvasElement: HTMLElement,
  writeText: (text: string) => Promise<void>,
): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  try {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "全文をコピー" }),
    );
  } finally {
    if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
}

export const CopyPending: Story = {
  play: async ({ canvasElement }) => {
    await attemptCopy(canvasElement, () => new Promise<void>(() => {}));
  },
};

export const CopyRejected: Story = {
  play: async ({ canvasElement }) => {
    await attemptCopy(canvasElement, async () => {
      throw new Error("Clipboard permission denied");
    });
  },
};

export const SaveFailed: Story = {
  play: async ({ canvasElement }) => {
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw new Error("Download unavailable");
    };
    try {
      await userEvent.click(
        within(canvasElement).getByRole("button", { name: "テキストを保存" }),
      );
    } finally {
      URL.createObjectURL = createObjectURL;
    }
  },
};

export const WithFeedback: Story = {
  render: function Render(args) {
    const feedbackButtonRef = useRef<HTMLButtonElement>(null);
    const feedback = useFeedback("outcome-story", async (_room, input) => ({
      ok: true,
      id: input.id,
    }));
    return (
      <>
        <RoomOutcomeView
          {...args}
          onOpenFeedback={() => feedback.open("app")}
          feedbackButtonRef={feedbackButtonRef}
          onExportSuccess={feedback.schedulePrompt}
          onExportFailure={feedback.cancelPrompt}
          feedbackPrompt={
            <FeedbackPrompt
              feedback={feedback}
              returnFocusRef={feedbackButtonRef}
            />
          }
        />
        <FeedbackPanel feedback={feedback} />
      </>
    );
  },
};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { HttpResponse, http } from "msw";
import { PreviewConsole } from "./preview-console";

const meta = {
  title: "Preview/PreviewConsole",
  component: PreviewConsole,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
    msw: {
      handlers: [
        http.post("/api/preview/rooms", () =>
          HttpResponse.json({ error: "unavailable" }, { status: 503 }),
        ),
      ],
    },
  },
} satisfies Meta<typeof PreviewConsole>;
export default meta;
export const FailedRequest: StoryObj<typeof meta> = {};

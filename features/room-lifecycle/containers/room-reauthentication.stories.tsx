import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { RoomReauthentication } from "./room-reauthentication";

const meta = {
  title: "RoomLifecycle/RoomReauthenticationContainer",
  component: RoomReauthentication,
  args: { operation: { kind: "join", inviteCode: "AB12CD" }, onBack: fn() },
} satisfies Meta<typeof RoomReauthentication>;
export default meta;
export const Ready: StoryObj<typeof meta> = {};

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RoomAdmissionGate } from "./room-admission-gate";

const meta = {
  title: "RoomLifecycle/RoomAdmissionGate",
  component: RoomAdmissionGate,
  args: {
    roomId: "11111111-1111-4111-8111-111111111111",
    children: <p>入室確認後のルーム</p>,
  },
} satisfies Meta<typeof RoomAdmissionGate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AuthenticationRequired: Story = {};

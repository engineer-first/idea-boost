import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { landingCopy } from "../logic/landing-copy";
import { LandingFaqItem } from "./landing-faq-item";

const item = landingCopy.faq.items.find((item) => "id" in item);
const meta = {
  title: "Landing/LandingFaqItem",
  component: LandingFaqItem,
  args: {
    id: item?.id,
    children: (
      <>
        <summary>{item?.question}</summary>
        <p>{item?.answer}</p>
      </>
    ),
  },
} satisfies Meta<typeof LandingFaqItem>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};

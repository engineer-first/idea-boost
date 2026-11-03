import { Zen_Maru_Gothic } from "next/font/google";

const zenMaru = Zen_Maru_Gothic({
  weight: "700",
  display: "swap",
  preload: false,
  variable: "--font-zen-maru-gothic",
});

export default function LandingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  return (
    <div
      className={`${zenMaru.variable} flex min-h-0 flex-1 flex-col overflow-hidden`}
    >
      {children}
    </div>
  );
}

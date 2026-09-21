import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NOTE_HEIGHT, NOTE_WIDTH } from "@/contracts/board";
import { MEMBER_COLOR_ASSIGNMENT_ORDER } from "@/contracts/room-protocol";
import { StickyNote } from "@/features/notes";
import { MemberAvatar } from "@/features/room-members";
import { RemoteCursor } from "../molecules/remote-cursor";

type MemberColorPaletteProps = {
  count: 1 | 2 | 4 | 6 | 20;
  scale: 1 | 0.62;
};

function MemberColorPalette({ count, scale }: MemberColorPaletteProps) {
  const colors = MEMBER_COLOR_ASSIGNMENT_ORDER.slice(0, count);
  const cardWidth = NOTE_WIDTH * scale;
  const cardHeight = NOTE_HEIGHT * scale;

  return (
    <TooltipProvider delayDuration={0}>
      <main className="min-h-screen overflow-auto bg-background p-6 text-foreground dark:bg-slate-950 dark:text-slate-100">
        <header className="mb-5">
          <h1 className="text-lg font-semibold">
            メンバー色 · {count} 人 · 表示倍率 {Math.round(scale * 100)}%
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            各付箋、アバター、名前付きカーソルに同じ作者色を表示します。
          </p>
        </header>
        <div
          className="grid items-start gap-4"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
          }}
        >
          {colors.map((color, index) => {
            const name = `${String(index + 1).padStart(2, "0")} ${color}`;
            const memberColor = color;
            return (
              <article
                key={memberColor}
                aria-label={`${index + 1}人目 ${memberColor}`}
                data-testid={`member-color-${index + 1}`}
                className="relative"
                style={{ width: cardWidth, height: cardHeight }}
              >
                <StickyNote
                  noteId={`palette-${memberColor}`}
                  color={memberColor}
                  isSelected={index === 1}
                  isDecided={index === 2}
                  isAdoptionFocused={index === 3}
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <div className="flex h-full flex-col p-3 text-sm">
                    <span className="font-semibold">{memberColor}</span>
                    <span className="mt-2">アイデアの例</span>
                    <div className="mt-auto">
                      <MemberAvatar name={name} color={memberColor} />
                    </div>
                  </div>
                  <RemoteCursor
                    cursor={{
                      userId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
                      name,
                      color: memberColor,
                      x: 0,
                      y: 0,
                      draggingNoteId: null,
                      lastSeenAt: 0,
                    }}
                    isIdle={false}
                    style={{
                      left: NOTE_WIDTH - 105,
                      top: NOTE_HEIGHT - 60,
                      transform: "translate3d(0, 0, 0)",
                    }}
                  />
                </StickyNote>
              </article>
            );
          })}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          2人目は選択中、3人目は決定済み、4人目は採用フォーカスの表示です。
          20人ストーリーは最後の8色も含みます。
        </p>
      </main>
    </TooltipProvider>
  );
}

const meta = {
  title: "Room/MemberColorPalette",
  component: MemberColorPalette,
  parameters: { layout: "fullscreen" },
  args: { count: 6, scale: 1 },
  argTypes: {
    count: { control: "select", options: [1, 2, 4, 6, 20] },
    scale: { control: "select", options: [1, 0.62] },
  },
} satisfies Meta<typeof MemberColorPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneMember: Story = { args: { count: 1, scale: 1 } };
export const TwoMembers: Story = { args: { count: 2, scale: 1 } };
export const FourMembers: Story = { args: { count: 4, scale: 1 } };
export const SixMembers: Story = { args: { count: 6, scale: 1 } };
export const TwentyMembers: Story = { args: { count: 20, scale: 1 } };
export const OneMemberCompact: Story = { args: { count: 1, scale: 0.62 } };
export const TwoMembersCompact: Story = { args: { count: 2, scale: 0.62 } };
export const FourMembersCompact: Story = { args: { count: 4, scale: 0.62 } };
export const SixMembersCompact: Story = { args: { count: 6, scale: 0.62 } };
export const TwentyMembersCompact: Story = { args: { count: 20, scale: 0.62 } };

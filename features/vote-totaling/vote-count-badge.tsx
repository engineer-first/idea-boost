// VoteTotaling の molecule。基礎UIは components/ui を利用する。
type VoteCountBadgeProps = {
  label: string;
  value: number;
  tone: "subjective" | "objective" | "score";
};

const TONE_CLASSES: Record<VoteCountBadgeProps["tone"], string> = {
  subjective: "bg-rose-100 text-rose-900",
  objective: "bg-sky-100 text-sky-900",
  score: "bg-muted text-foreground",
};

export function VoteCountBadge({ label, value, tone }: VoteCountBadgeProps) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-md px-2 text-xs font-medium tabular-nums ${TONE_CLASSES[tone]}`}
    >
      {label ? `${label} ${value}` : value}
    </span>
  );
}

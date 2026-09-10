// フェーズ1から持ち越された決定課題をボード上に掲示するフローティングバナー。
// Step 2-2 以降テンプレートパネルが消えても掲示だけは残るため、
// パネルから独立した1要素にしている。
import { Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DECIDED_ISSUE_LABEL } from "../logic/hmw-content";

export type HmwDecidedIssueBannerProps = {
  // フェーズ1から持ち越された決定課題の本文
  content: string;
  label?: string;
  className?: string;
  compact?: boolean;
};

export function HmwDecidedIssueBanner({
  content,
  label = DECIDED_ISSUE_LABEL,
  className,
  compact = false,
}: HmwDecidedIssueBannerProps) {
  return (
    <div
      data-testid="hmw-decided-issue-banner"
      className={cn(
        "board-hud flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 shadow-md",
        compact && "h-10 w-full min-w-0 py-1",
        className,
      )}
    >
      <Pin
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="shrink-0 font-medium text-muted-foreground text-sm">
        {label}
      </span>
      {/* コンパクト表示では高さを固定し、全文はポップオーバーで読める。 */}
      <span
        className={cn(
          "min-w-0 font-semibold text-sm",
          compact ? "flex-1 truncate" : "whitespace-normal break-words",
        )}
      >
        {content}
      </span>
      {compact ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0"
              aria-label={`${label}の全文を表示`}
            >
              全文
            </Button>
          </PopoverTrigger>
          <PopoverContent
            aria-label={`${label}の全文`}
            className="max-h-[min(24rem,calc(100dvh-6rem))] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto bg-background"
          >
            <p className="mb-2 text-sm text-muted-foreground">{label}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

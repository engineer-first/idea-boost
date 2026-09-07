import { Clock3 } from "lucide-react";
import type { FacilitationGuideContent } from "../logic/facilitation-guide";

export type FacilitationGuideProps = {
  id: string;
  guide: FacilitationGuideContent;
  isHost: boolean;
  isExpanded: boolean;
};

export function FacilitationGuide({
  id,
  guide,
  isHost,
  isExpanded,
}: FacilitationGuideProps) {
  return (
    <div
      aria-hidden={!isExpanded}
      className={`grid origin-top overflow-hidden transition-[grid-template-rows,opacity,transform] duration-200 ease-out motion-reduce:scale-100 motion-reduce:transition-opacity motion-reduce:duration-100 ${
        isExpanded
          ? "grid-rows-[1fr] scale-100 opacity-100"
          : "pointer-events-none grid-rows-[0fr] scale-[0.98] opacity-0"
      }`}
      data-testid="facilitation-guide-shell"
    >
      <section
        id={id}
        aria-label="ファシリテーションガイド"
        aria-live="polite"
        className="min-h-0 border-t border-border/70 px-4 pt-3 pb-4"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background tabular-nums">
            <Clock3 aria-hidden="true" className="size-3.5" />
            {guide.durationMinutes}分
          </span>
          <p className="text-sm leading-6 font-medium text-foreground">
            {guide.message}
          </p>
        </div>
        {isHost && guide.hostMessage !== null ? (
          <div className="mt-3 ml-10 rounded-lg border border-border/80 bg-muted/60 px-3 py-2.5">
            <p className="text-[0.6875rem] leading-none font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              進行役へ
            </p>
            <p className="mt-1.5 text-xs leading-5 text-foreground">
              {guide.hostMessage}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { IDEA_VALUE_FEASIBILITY_MAP_LABELS } from "../logic/idea-value-feasibility-map";

const MAP_GRID_STYLE = {
  backgroundImage:
    "linear-gradient(to right, color-mix(in srgb, var(--muted-foreground) 18%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--muted-foreground) 18%, transparent) 1px, transparent 1px)",
  backgroundSize: "10% 10%",
} satisfies CSSProperties;

// アイデア整理用の連続的な2軸平面。将来の子要素を absolute 配置できるよう、
// 平面そのものを relative に保つ。子要素は0〜100の連続座標で配置する。
export type IdeaValueFeasibilityMapProps = {
  children?: ReactNode;
  planeRef?: Ref<HTMLDivElement>;
};

export function IdeaValueFeasibilityMap({
  children,
  planeRef,
}: IdeaValueFeasibilityMapProps) {
  const labels = IDEA_VALUE_FEASIBILITY_MAP_LABELS;

  return (
    <section
      aria-label={labels.ariaLabel}
      className="pointer-events-none absolute left-1/2 top-1/2 z-10 grid size-[min(90cqh,90cqw)] -translate-x-1/2 -translate-y-1/2 aspect-square grid-cols-[4rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_4rem] gap-3 select-none"
      data-testid="idea-value-feasibility-map"
    >
      <span className="sr-only absolute">{labels.title}</span>
      <fieldset
        aria-label={labels.valueScaleAriaLabel}
        className="relative col-start-1 row-start-1 m-0 min-h-0 w-16 min-w-0 border-0 p-0 text-muted-foreground"
      >
        <span className="absolute right-2 top-1 text-xs font-medium">
          {labels.high}
        </span>
        <div
          aria-hidden="true"
          className="absolute bottom-7 right-3 top-7 w-1 rounded-full bg-linear-to-t from-muted-foreground/20 via-muted-foreground/45 to-primary/75"
          data-testid="idea-value-feasibility-map-y-scale-bar"
        >
          <ArrowUp className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 text-primary" />
        </div>
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/95 px-1.5 py-2 text-[11px] font-medium tracking-wide text-foreground shadow-sm [writing-mode:vertical-rl]"
          data-testid="idea-value-feasibility-map-y-axis-label"
        >
          {labels.value}
        </span>
        <span className="absolute bottom-1 right-2 text-xs font-medium">
          {labels.low}
        </span>
      </fieldset>

      <div
        ref={planeRef}
        className="pointer-events-auto relative col-start-2 row-start-1 min-h-0 min-w-0 overflow-hidden rounded-xl border border-border bg-sky-50/90 shadow-sm"
        data-canvas-background="true"
        data-coordinate-range="0-100"
        data-testid="idea-value-feasibility-map-plane"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          data-canvas-background="true"
          data-testid="idea-value-feasibility-map-plane-grid"
          style={MAP_GRID_STYLE}
        />
        {children}
      </div>

      <fieldset
        aria-label={labels.feasibilityScaleAriaLabel}
        className="relative z-10 col-start-2 row-start-2 m-0 h-16 min-w-0 border-0 p-0 text-muted-foreground"
      >
        <span className="absolute left-1 top-1 text-xs font-medium">
          {labels.low}
        </span>
        <div
          aria-hidden="true"
          className="absolute left-4 right-4 top-4 h-1 rounded-full bg-linear-to-r from-muted-foreground/20 via-muted-foreground/45 to-primary/75"
          data-testid="idea-value-feasibility-map-x-scale-bar"
        >
          <ArrowLeft className="absolute left-0 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
          <ArrowRight className="absolute right-0 top-1/2 size-4 translate-x-1/2 -translate-y-1/2 text-primary" />
        </div>
        <span
          className="absolute left-1/2 top-9 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-background/95 px-2.5 py-1 text-[11px] font-medium tracking-wide text-foreground shadow-sm"
          data-testid="idea-value-feasibility-map-x-axis-label"
        >
          {labels.feasibility}
        </span>
        <span className="absolute right-1 top-1 text-xs font-medium">
          {labels.high}
        </span>
      </fieldset>
    </section>
  );
}

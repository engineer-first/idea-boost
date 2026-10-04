import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { IDEA_MAP_BASE_DIMENSIONS } from "@/contracts/board";
import {
  getIdeaValueFeasibilityMapDimensions,
  IDEA_MAP_AXIS_SIZE,
  IDEA_MAP_GRID_GAP,
  IDEA_VALUE_FEASIBILITY_MAP_LABELS,
} from "../logic/idea-value-feasibility-map";

const MAP_GRID_STYLE = {
  backgroundImage:
    "linear-gradient(to right, color-mix(in srgb, var(--muted-foreground) 18%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--muted-foreground) 18%, transparent) 1px, transparent 1px)",
  backgroundSize: "10% 10%",
} satisfies CSSProperties;

const AXIS_LABEL_BASE_FONT_SIZE = 48;
const AXIS_LABEL_MIN_FONT_SIZE = 42;
const AXIS_LABEL_MAX_FONT_SIZE = 87;
const AXIS_LABEL_X_OFFSET_TOP = 24;
const AXIS_LABEL_X_ROW_BASE_HEIGHT = IDEA_MAP_AXIS_SIZE;

// アイデア整理用の連続的な2軸平面。将来の子要素を absolute 配置できるよう、
// 平面そのものを relative に保つ。子要素は0〜100の連続座標で配置する。
export type IdeaValueFeasibilityMapProps = {
  children?: ReactNode;
  overlay?: ReactNode;
  planeRef?: Ref<HTMLDivElement>;
  sizeLevel?: number;
};

export function IdeaValueFeasibilityMap({
  children,
  overlay,
  planeRef,
  sizeLevel = 0,
}: IdeaValueFeasibilityMapProps) {
  const labels = IDEA_VALUE_FEASIBILITY_MAP_LABELS;
  const dimensions = getIdeaValueFeasibilityMapDimensions(sizeLevel);
  const mapScale = dimensions.width / IDEA_MAP_BASE_DIMENSIONS.width;
  const axisLabelFontSize = Math.round(
    Math.min(
      AXIS_LABEL_MAX_FONT_SIZE,
      Math.max(AXIS_LABEL_MIN_FONT_SIZE, AXIS_LABEL_BASE_FONT_SIZE * mapScale),
    ),
  );
  const axisLabelStyle = {
    fontSize: axisLabelFontSize,
    lineHeight: `${axisLabelFontSize}px`,
  } satisfies CSSProperties;
  const axisLabelXRowExpansion = Math.max(
    0,
    AXIS_LABEL_X_OFFSET_TOP +
      axisLabelFontSize +
      2 -
      AXIS_LABEL_X_ROW_BASE_HEIGHT,
  );
  // 下段と外枠を同じ分だけ伸ばし、軸ラベルを収めつつマップ面の寸法・位置を保つ。
  const sectionHeight = dimensions.height + axisLabelXRowExpansion;
  const axisLabelXRowHeight =
    AXIS_LABEL_X_ROW_BASE_HEIGHT + axisLabelXRowExpansion;

  return (
    <section
      aria-label={labels.ariaLabel}
      className="pointer-events-none absolute z-10 grid grid-cols-[4rem_minmax(0,1fr)] gap-3 select-none"
      data-testid="idea-value-feasibility-map"
      style={{
        width: dimensions.width,
        height: sectionHeight,
        left: `calc(50% - ${IDEA_MAP_BASE_DIMENSIONS.width / 2}px)`,
        bottom: `calc(50% - ${IDEA_MAP_BASE_DIMENSIONS.height / 2}px - ${axisLabelXRowExpansion}px)`,
        gridTemplateColumns: `${IDEA_MAP_AXIS_SIZE}px minmax(0, 1fr)`,
        gap: IDEA_MAP_GRID_GAP,
        gridTemplateRows: `minmax(0, 1fr) ${axisLabelXRowHeight}px`,
      }}
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
          className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/95 px-0 py-2 font-semibold tracking-wide text-foreground shadow-sm [writing-mode:vertical-rl]"
          data-testid="idea-value-feasibility-map-y-axis-label"
          style={axisLabelStyle}
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
      {overlay ? (
        <div className="pointer-events-none relative z-20 col-start-2 row-start-1 min-h-0 min-w-0">
          {overlay}
        </div>
      ) : null}

      <fieldset
        aria-label={labels.feasibilityScaleAriaLabel}
        className="relative z-10 col-start-2 row-start-2 m-0 h-full min-w-0 border-0 p-0 text-muted-foreground"
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
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-background/95 px-2.5 py-0 font-semibold tracking-wide text-foreground shadow-sm"
          data-testid="idea-value-feasibility-map-x-axis-label"
          style={{ ...axisLabelStyle, top: AXIS_LABEL_X_OFFSET_TOP }}
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

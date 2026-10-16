import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { IDEA_VALUE_FEASIBILITY_MAP_LABELS } from "../logic/idea-value-feasibility-map";

const GRID_STYLE = {
  backgroundImage:
    "linear-gradient(to right, color-mix(in srgb, var(--muted-foreground) 18%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--muted-foreground) 18%, transparent) 1px, transparent 1px)",
  backgroundSize: "10% 10%",
} satisfies CSSProperties;

export type FixedIdeaMapProps = {
  children?: ReactNode;
  overlay?: ReactNode;
  positionAreaRef?: Ref<HTMLDivElement>;
  workspace?: boolean;
};

/**
 * アイデア配置用の固定マップ。キャンバスカメラとは独立し、軸と付箋を
 * ボード領域内に固定表示する。座標領域は付箋が外枠からはみ出さない寸法。
 */
export function FixedIdeaMap({
  children,
  overlay,
  positionAreaRef,
  workspace = false,
}: FixedIdeaMapProps) {
  const labels = IDEA_VALUE_FEASIBILITY_MAP_LABELS;

  return (
    <section
      aria-label={labels.ariaLabel}
      className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center ${workspace ? "[container-type:size] px-4 pt-[var(--board-map-top,7rem)] pb-4" : "p-3 pt-20 sm:p-6 sm:pt-24"}`}
      data-testid="idea-map-fixed-board"
    >
      <div
        className={`flex w-full flex-col gap-2 sm:gap-3 ${workspace ? "h-[min(100%,calc(55.5556cqw+3rem))]" : "h-full"}`}
        data-testid="idea-map-layout"
      >
        <span className="sr-only">{labels.title}</span>
        <div
          className={`flex min-h-0 flex-1 items-center gap-2 ${workspace ? "sm:gap-3" : "sm:gap-4"}`}
        >
          <fieldset
            aria-label={labels.valueScaleAriaLabel}
            className={`relative m-0 shrink-0 border-0 p-0 text-muted-foreground ${workspace ? "h-full w-8 sm:w-12" : "w-10 sm:w-16"}`}
          >
            <span className="absolute top-0 left-1/2 -translate-x-1/2 text-sm font-medium sm:text-base">
              {labels.high}
            </span>
            {workspace ? (
              <div
                aria-hidden="true"
                className="absolute top-7 bottom-7 left-1/2 w-px bg-border"
              />
            ) : null}
            <ArrowUp
              aria-hidden="true"
              className="absolute top-7 left-1/2 size-4 -translate-x-1/2 text-primary sm:size-5"
            />
            <span
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-background px-2 py-2 text-xl font-bold tracking-wide text-foreground sm:text-2xl ${workspace ? "" : "rounded-full border border-border shadow-sm sm:px-3"}`}
              data-testid="idea-value-feasibility-map-y-axis-label"
              style={{ writingMode: "vertical-rl" }}
            >
              {labels.value}
            </span>
            <ArrowDown
              aria-hidden="true"
              className="absolute bottom-7 left-1/2 size-4 -translate-x-1/2 text-muted-foreground sm:size-5"
            />
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-sm font-medium sm:text-base">
              {labels.low}
            </span>
          </fieldset>

          <div
            className="relative flex h-full min-h-0 min-w-0 flex-1 items-center justify-center [container-type:size]"
            data-testid="idea-value-feasibility-map-slot"
          >
            <section
              aria-label={labels.title}
              className="relative min-h-0 min-w-0 overflow-hidden rounded-2xl border border-sky-200 bg-sky-50 shadow-inner [--idea-map-note-scale:0.6] [--idea-map-note-inset:120px] [--idea-map-note-top-inset:132px] sm:[--idea-map-note-scale:0.75] sm:[--idea-map-note-inset:150px] sm:[--idea-map-note-top-inset:165px] lg:[--idea-map-note-scale:1] lg:[--idea-map-note-inset:200px] lg:[--idea-map-note-top-inset:220px]"
              data-testid="idea-value-feasibility-map-plane"
              style={
                workspace
                  ? {
                      aspectRatio: "9 / 5",
                      width: "min(100%, 180cqh)",
                      height: "min(100%, 55.5556cqw)",
                    }
                  : { width: "100%", height: "100%" }
              }
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                data-testid="idea-value-feasibility-map-plane-grid"
                style={GRID_STYLE}
              />
              {workspace ? (
                <>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-sky-300"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-sky-300"
                  />
                </>
              ) : null}
              <div
                ref={positionAreaRef}
                className="pointer-events-auto absolute top-[var(--idea-map-note-top-inset)] right-[var(--idea-map-note-inset)] bottom-0 left-0"
                data-canvas-background="true"
                data-coordinate-range="0-100"
                data-testid="idea-map-fixed-position-area"
              >
                {children}
                {overlay ? (
                  <div className="pointer-events-none absolute inset-0 z-20">
                    {overlay}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        <fieldset
          aria-label={labels.feasibilityScaleAriaLabel}
          className={`relative m-0 shrink-0 border-0 p-0 text-muted-foreground ${workspace ? "ml-10 h-10 sm:ml-15" : "ml-10 h-14 sm:ml-16"}`}
        >
          <span className="absolute top-0 left-0 text-sm font-medium sm:text-base">
            {labels.low}
          </span>
          <div
            aria-hidden="true"
            className="absolute top-3 right-4 left-4 h-0.5 rounded-full bg-linear-to-r from-muted-foreground/25 via-muted-foreground/50 to-primary"
          >
            <ArrowLeft className="absolute top-1/2 left-0 size-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground sm:size-5" />
            <ArrowRight className="absolute top-1/2 right-0 size-4 translate-x-1/2 -translate-y-1/2 text-primary sm:size-5" />
          </div>
          <span
            className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-background px-3 py-1 font-bold tracking-wide text-foreground ${workspace ? "top-3 text-base sm:text-lg" : "top-7 rounded-full border border-border text-lg shadow-sm sm:text-2xl"}`}
            data-testid="idea-value-feasibility-map-x-axis-label"
          >
            {labels.feasibility}
          </span>
          <span className="absolute top-0 right-0 text-sm font-medium sm:text-base">
            {labels.high}
          </span>
        </fieldset>
      </div>
    </section>
  );
}

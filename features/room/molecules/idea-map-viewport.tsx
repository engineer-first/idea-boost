import { ArrowDown, ArrowUp } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { IDEA_VALUE_FEASIBILITY_MAP_LABELS } from "../logic/idea-value-feasibility-map";
import styles from "./idea-map-viewport.module.css";

const GRID_STYLE = {
  backgroundImage:
    "linear-gradient(to right, color-mix(in srgb, var(--muted-foreground) 18%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--muted-foreground) 18%, transparent) 1px, transparent 1px)",
  backgroundSize: "10% 10%",
} satisfies CSSProperties;
const AXIS_ARROW_SIZE = "size-4 sm:size-5";
const AXIS_ARROW_PATH = "M -6 -6 L 0 0 L -6 6";
const AXIS_COLORS = {
  low: "color-mix(in srgb, var(--muted-foreground) 55%, var(--background))",
  middle: "color-mix(in srgb, var(--muted-foreground) 80%, var(--background))",
  high: "color-mix(in srgb, var(--primary) 85%, var(--background))",
};

function AxisStroke({
  axis,
  className,
}: {
  axis: "x" | "y";
  className: string;
}) {
  const gradientId = useId();
  const vertical = axis === "y";
  const low = {
    x: vertical ? "50%" : "0%",
    y: vertical ? "100%" : "50%",
  };
  const high = {
    x: vertical ? "50%" : "100%",
    y: vertical ? "0%" : "50%",
  };

  return (
    <svg
      aria-hidden="true"
      className={`${styles.axisStroke} ${className}`}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-testid={`idea-value-feasibility-map-${axis}-scale-bar`}
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={low.x}
          y1={low.y}
          x2={high.x}
          y2={high.y}
        >
          <stop offset="0%" stopColor={AXIS_COLORS.low} />
          <stop offset="50%" stopColor={AXIS_COLORS.middle} />
          <stop offset="100%" stopColor={AXIS_COLORS.high} />
        </linearGradient>
      </defs>
      <line
        x1={low.x}
        y1={low.y}
        x2={high.x}
        y2={high.y}
        stroke={`url(#${gradientId})`}
      />
      {/* 線の端点を矢印の先端にも使い、レスポンシブでも線が突き抜けないようにする。 */}
      <svg
        aria-hidden="true"
        x={low.x}
        y={low.y}
        width={1}
        height={1}
        overflow="visible"
      >
        <path
          d={AXIS_ARROW_PATH}
          transform={`rotate(${vertical ? 90 : 180})`}
          stroke={AXIS_COLORS.low}
          data-testid={`idea-value-feasibility-map-${axis}-low-arrow`}
        />
      </svg>
      <svg
        aria-hidden="true"
        x={high.x}
        y={high.y}
        width={1}
        height={1}
        overflow="visible"
      >
        <path
          d={AXIS_ARROW_PATH}
          transform={vertical ? "rotate(-90)" : undefined}
          stroke={AXIS_COLORS.high}
          data-testid={`idea-value-feasibility-map-${axis}-high-arrow`}
        />
      </svg>
    </svg>
  );
}

export type IdeaMapViewportProps = {
  children?: ReactNode;
  overlay?: ReactNode;
  workspaceControls?: { phaseLoop: ReactNode; mapSize: ReactNode };
  groupHorizontalAxisEndpoint?: boolean;
  planeRef?: Ref<HTMLDivElement>;
  workspace?: boolean;
  expanded?: boolean;
  zoom?: number;
};

/**
 * アイデア配置用の固定マップ。ボードカメラとは独立し、既定では軸と付箋を
 * ボード領域内に固定表示する。zoomは個人用の表示倍率。
 * 付箋の移動範囲は表示後の寸法に合わせてマップの内枠いっぱいに取る。
 */
export function IdeaMapViewport({
  children,
  overlay,
  workspaceControls,
  groupHorizontalAxisEndpoint = false,
  planeRef,
  workspace = false,
  expanded = false,
  zoom = 1,
}: IdeaMapViewportProps) {
  const horizontalAxisRef = useRef<HTMLFieldSetElement>(null);
  const horizontalEndpointRef = useRef<HTMLDivElement>(null);
  const labels = IDEA_VALUE_FEASIBILITY_MAP_LABELS;
  const transforms = [
    workspace ? "translateY(var(--board-map-shift-y, 0px))" : null,
    zoom === 1 ? null : `scale(${zoom})`,
  ].filter((transform) => transform !== null);

  useLayoutEffect(() => {
    const axis = horizontalAxisRef.current;
    const endpoint = horizontalEndpointRef.current;
    const frame = axis?.closest<HTMLElement>('[data-testid="board-frame"]');
    if (
      !workspace ||
      !groupHorizontalAxisEndpoint ||
      !axis ||
      !endpoint ||
      !frame
    )
      return;

    const offsetAnchor = frame.querySelector<HTMLElement>(
      '[data-testid="idea-map-axis-low-anchor"]',
    );
    const zoomHud = frame.querySelector<HTMLElement>(
      '[data-testid="canvas-zoom-hud"]',
    );
    const offsetProperty = "--horizontal-low-endpoint-offset";
    const updateOffset = (): void => {
      const bounds = endpoint.getBoundingClientRect();
      // Reactの未反映state/refではなく、実際にDOMへ適用済みの補正だけを戻す。
      const appliedOffset =
        Number.parseFloat(endpoint.style.getPropertyValue(offsetProperty)) || 0;
      const baselineLeft = bounds.left - appliedOffset * zoom;
      const anchor = offsetAnchor?.getBoundingClientRect();
      const zoomBounds = zoomHud?.getBoundingClientRect();
      const overlapsVertically = (other: DOMRect | undefined): boolean =>
        Boolean(
          other && bounds.bottom > other.top && bounds.top < other.bottom,
        );
      const overlapsZoomHud = Boolean(
        zoomBounds && overlapsVertically(zoomBounds),
      );
      const overlapsAxisLowAnchor = Boolean(
        anchor && overlapsVertically(anchor),
      );
      const targetLeft = Math.max(
        baselineLeft,
        overlapsAxisLowAnchor && anchor?.width
          ? anchor.right + 28
          : baselineLeft,
        overlapsZoomHud && zoomBounds ? zoomBounds.right + 17 : baselineLeft,
      );
      const offset =
        Math.round(((targetLeft - baselineLeft) / zoom) * 100) / 100;
      if (offset === 0) endpoint.style.removeProperty(offsetProperty);
      else if (offset !== appliedOffset)
        endpoint.style.setProperty(offsetProperty, `${offset}px`);
    };
    updateOffset();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateOffset);
    resizeObserver?.observe(frame);
    resizeObserver?.observe(axis);
    if (offsetAnchor) resizeObserver?.observe(offsetAnchor);
    if (zoomHud) resizeObserver?.observe(zoomHud);

    // ヘッダーはマップをCSS変数で移動する。transformだけの変化は
    // ResizeObserverでは通知されないため、位置確定も同じ計算へ反映する。
    const board = frame.closest<HTMLElement>(
      '[data-testid="room-board-view-root"]',
    );
    const layoutObserver = board ? new MutationObserver(updateOffset) : null;
    if (board)
      layoutObserver?.observe(board, {
        attributes: true,
        attributeFilter: ["style"],
      });
    window.addEventListener("resize", updateOffset);
    return () => {
      resizeObserver?.disconnect();
      layoutObserver?.disconnect();
      window.removeEventListener("resize", updateOffset);
      endpoint.style.removeProperty(offsetProperty);
    };
  }, [workspace, groupHorizontalAxisEndpoint, zoom]);

  return (
    <section
      aria-label={labels.ariaLabel}
      className={`${workspace ? styles.workspace : ""} pointer-events-none absolute inset-0 z-10 flex items-center justify-center ${workspace ? "[container-type:size] px-4 pt-[var(--board-map-top,7rem)] pb-4" : "p-3 pt-20 sm:p-6 sm:pt-24"}`}
      data-testid="idea-map-viewport"
      data-map-workspace={workspace || undefined}
      data-expanded={expanded}
      style={
        transforms.length === 0
          ? undefined
          : {
              transform: transforms.join(" "),
              transformOrigin: "center center",
            }
      }
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
              <AxisStroke axis="y" className={styles.verticalAxisTrack} />
            ) : (
              <>
                <ArrowUp
                  aria-hidden="true"
                  className={`absolute top-7 left-1/2 ${AXIS_ARROW_SIZE} -translate-x-1/2 text-primary`}
                />
                <ArrowDown
                  aria-hidden="true"
                  className={`absolute bottom-7 left-1/2 ${AXIS_ARROW_SIZE} -translate-x-1/2 text-muted-foreground`}
                />
              </>
            )}
            <span
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-background px-2 py-2 text-xl font-bold tracking-wide text-foreground sm:text-2xl ${workspace ? "" : "rounded-full border border-border shadow-sm sm:px-3"}`}
              data-testid="idea-value-feasibility-map-y-axis-label"
              style={{ writingMode: "vertical-rl" }}
            >
              {labels.value}
            </span>
            <span
              className={`absolute bottom-0 left-1/2 -translate-x-1/2 text-sm font-medium sm:text-base ${workspace ? styles.workspaceCompactValueLow : ""}`}
            >
              {labels.low}
            </span>
          </fieldset>

          <div
            className="relative flex h-full min-h-0 min-w-0 flex-1 items-center justify-center [container-type:size]"
            data-testid="idea-value-feasibility-map-slot"
          >
            <div
              className="relative min-h-0 min-w-0"
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
              {/* 従来の表示枠は上端・横幅・操作UIの基準として残す。
                  マップ面だけをslotの下端まで伸ばし、中央寄せで生じた下側の空きを埋める。 */}
              <section
                aria-label={labels.title}
                className={`${workspace ? styles.workspacePlane : ""} absolute top-0 left-0 min-h-0 min-w-0 overflow-visible rounded-2xl border border-sky-200 bg-sky-50 shadow-inner [container-type:inline-size] [container-name:map-plane] [--idea-map-note-scale:0.6] [--idea-map-note-transform-origin:30%_70%] sm:[--idea-map-note-scale:0.75] sm:[--idea-map-note-transform-origin:37.5%_62.5%] lg:[--idea-map-note-scale:1] lg:[--idea-map-note-transform-origin:50%_50%]`}
                data-testid="idea-value-feasibility-map-plane"
                style={{
                  width: workspace ? undefined : "100%",
                  // 中央寄せで上下に分かれていた余白のうち、下半分だけを加える。
                  height: workspace ? "calc((100% + 100cqh) / 2)" : "100%",
                }}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[inherit]"
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
                  className="pointer-events-none absolute inset-0"
                  data-testid="idea-map-note-layer"
                >
                  <div
                    ref={planeRef}
                    className="pointer-events-auto absolute inset-0"
                    data-canvas-background="true"
                    data-coordinate-range="0-100"
                    data-testid="idea-map-viewport-plane"
                  >
                    {children}
                    {overlay ? (
                      <div className="pointer-events-none absolute inset-0 z-[2147483647]">
                        {overlay}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
              {workspace && workspaceControls ? (
                <div
                  className={styles.workspaceControls}
                  data-testid="idea-map-workspace-controls"
                >
                  <div
                    className={styles.workspacePhaseLoopHud}
                    data-testid="phase-loop-hud"
                    style={
                      {
                        "--workspace-controls-bottom": `${20 / zoom}px`,
                        "--workspace-controls-zoom": `${1 / zoom}`,
                      } as CSSProperties
                    }
                  >
                    <div className={styles.workspaceControlsContent}>
                      {workspaceControls.phaseLoop}
                    </div>
                  </div>
                  <div
                    className={styles.workspaceMapSizeHud}
                    data-testid="idea-map-size-controls-hud"
                    style={
                      {
                        "--workspace-controls-bottom": `${20 / zoom}px`,
                        "--workspace-controls-zoom": `${1 / zoom}`,
                      } as CSSProperties
                    }
                  >
                    <div className={styles.workspaceControlsContent}>
                      {workspaceControls.mapSize}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <fieldset
          ref={horizontalAxisRef}
          aria-label={labels.feasibilityScaleAriaLabel}
          className={`relative m-0 shrink-0 border-0 p-0 text-muted-foreground ${groupHorizontalAxisEndpoint ? styles.workspaceFeasibilityAxis : ""} ${workspace ? "ml-10 h-10 sm:ml-15" : "ml-10 h-14 sm:ml-16"}`}
        >
          {groupHorizontalAxisEndpoint ? (
            <div
              ref={horizontalEndpointRef}
              className={`${styles.horizontalLowEndpointGroup} absolute flex whitespace-nowrap text-sm font-medium sm:text-base`}
              data-testid="idea-map-x-low-endpoint"
            >
              <span
                className="shrink-0"
                data-testid="idea-value-feasibility-map-x-low-label"
              >
                {labels.low}
              </span>
              <AxisStroke
                axis="x"
                className={styles.horizontalLowEndpointTrack}
              />
            </div>
          ) : (
            <>
              <span
                className={`absolute top-0 left-0 flex h-6 items-center text-sm font-medium sm:text-base ${workspace ? styles.workspaceCompactFeasibilityLow : ""}`}
                data-testid="idea-value-feasibility-map-x-low-label"
              >
                {labels.low}
              </span>
              <AxisStroke
                axis="x"
                className={`${styles.horizontalAxisTrack} ${workspace ? styles.workspaceUngroupedAxisTrack : ""}`}
              />
            </>
          )}
          <span
            className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-background px-3 py-1 font-bold tracking-wide text-foreground ${workspace ? `top-3 text-base sm:text-lg ${groupHorizontalAxisEndpoint ? styles.workspaceInlineFeasibilityLabel : ""}` : "top-7 rounded-full border border-border text-lg shadow-sm sm:text-2xl"}`}
            data-testid="idea-value-feasibility-map-x-axis-label"
          >
            {labels.feasibility}
          </span>
          <span
            className={`absolute top-0 right-0 flex h-6 items-center text-sm font-medium sm:text-base ${workspace && !groupHorizontalAxisEndpoint ? styles.workspaceCompactFeasibilityHigh : ""}`}
          >
            {labels.high}
          </span>
        </fieldset>
      </div>
    </section>
  );
}

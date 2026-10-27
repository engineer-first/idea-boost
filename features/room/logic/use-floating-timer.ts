import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  placeRoomTimer,
  type TimerPosition,
  type TimerRect,
} from "./timer-position";

const OBSTACLES =
  '[data-testid="board-control-hud"], [data-testid="board-context-hud"], [data-testid="board-location-card"], [data-testid="private-notes-toolbar"], [data-testid="canvas-zoom-hud"], [data-testid="board-tools-hud"], [data-testid="board-operation-matrix"], [data-testid="idea-map-size-controls-hud"]';

export function useFloatingTimer(
  ref: RefObject<HTMLElement | null>,
  expanded: boolean,
  compact: boolean,
) {
  const [dragging, setDragging] = useState(false);
  const position = useRef<TimerPosition | null>(null);
  const moved = useRef(false);
  const suppressClick = useRef(false);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    origin: TimerPosition;
    active: boolean;
  } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const targetWidth = expanded
    ? Math.min(compact ? 112 : 288, viewportWidth - 24)
    : 72;
  const widthRef = useRef(72);
  const targetRef = useRef(targetWidth);
  const velocity = useRef(0);

  const layout = (width = targetRef.current, settle = true) => {
    const element = ref.current;
    if (!element) return;
    const root = element.closest<HTMLElement>(
      '[data-testid="room-board-view-root"]',
    );
    const bounds = root?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
    };
    setViewportWidth(bounds.width || window.innerWidth);
    const hud = root?.querySelector<HTMLElement>(
      '[data-testid="board-control-hud"]',
    );
    const hudBottom = hud?.getBoundingClientRect().bottom ?? bounds.top + 56;
    const obstacleNodes = Array.from(
      root?.querySelectorAll<HTMLElement>(OBSTACLES) ?? [],
    ).filter((node) => node.offsetWidth > 0 && node.offsetHeight > 0);
    const initial = placeRoomTimer(
      { right: bounds.right - 12, top: hudBottom + 12 },
      width,
      bounds,
      obstacleNodes
        .filter((node) => node.dataset.testid !== "private-notes-toolbar")
        .map((node) => node.getBoundingClientRect()),
    );
    // 狭幅で楕円が現在地の下へ移る場合も、マイ付箋はその下から開く。
    root?.style.setProperty(
      "--board-timer-row-bottom",
      `${initial.top - bounds.top + 84}px`,
    );
    const obstacles: TimerRect[] = obstacleNodes
      .filter(
        (node) =>
          moved.current || node.dataset.testid !== "private-notes-toolbar",
      )
      .map((node) => node.getBoundingClientRect());
    if (!position.current || !moved.current) position.current = initial;
    if (settle)
      position.current = placeRoomTimer(
        position.current,
        width,
        bounds,
        obstacles,
      );
    element.style.left = `${position.current.right - width}px`;
    element.style.top = `${position.current.top}px`;
  };
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useLayoutEffect(() => {
    targetRef.current = targetWidth;
    const element = ref.current;
    if (!element) return;
    layoutRef.current(targetWidth);
    if (
      typeof window.requestAnimationFrame !== "function" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      widthRef.current = targetWidth;
      element.style.width = `${targetWidth}px`;
      return;
    }
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.032);
      previous = now;
      const difference = targetRef.current - widthRef.current;
      velocity.current += (500 * difference - 45 * velocity.current) * dt;
      widthRef.current += velocity.current * dt;
      if (Math.abs(difference) < 0.1 && Math.abs(velocity.current) < 0.1) {
        widthRef.current = targetRef.current;
        velocity.current = 0;
      }
      element.style.width = `${widthRef.current}px`;
      element.style.left = `${(position.current?.right ?? targetRef.current) - widthRef.current}px`;
      if (widthRef.current !== targetRef.current)
        frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [ref, targetWidth]);

  useLayoutEffect(() => {
    const root = ref.current?.closest<HTMLElement>(
      '[data-testid="room-board-view-root"]',
    );
    const update = () => {
      if (!drag.current) layoutRef.current();
    };
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (root) {
      observer?.observe(root);
      for (const node of root.querySelectorAll<HTMLElement>(OBSTACLES))
        observer?.observe(node);
    }
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      root?.style.removeProperty("--board-timer-row-bottom");
    };
  }, [ref]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !position.current) return;
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: { ...position.current },
      active: false,
    };
    suppressClick.current = false;
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.active && Math.hypot(dx, dy) < 8) return;
    if (!current.active) {
      current.active = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(true);
    }
    moved.current = true;
    suppressClick.current = true;
    position.current = {
      right: current.origin.right + dx,
      top: current.origin.top + dy,
    };
    layoutRef.current(widthRef.current, false);
    event.preventDefault();
  };
  const onPointerEnd = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    layoutRef.current();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      !event.altKey ||
      !position.current ||
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    moved.current = true;
    position.current = {
      right:
        position.current.right +
        (event.key === "ArrowRight" ? 24 : event.key === "ArrowLeft" ? -24 : 0),
      top:
        position.current.top +
        (event.key === "ArrowDown" ? 24 : event.key === "ArrowUp" ? -24 : 0),
    };
    layoutRef.current();
  };
  return {
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onLostPointerCapture: onPointerEnd,
    onKeyDown,
    onClickCapture: (event: {
      preventDefault: () => void;
      stopPropagation: () => void;
    }) => {
      if (suppressClick.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }
    },
  };
}

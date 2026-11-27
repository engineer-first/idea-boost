import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { NOTE_HEIGHT } from "@/contracts/board";
import {
  placeRoomTimer,
  snapRoomTimer,
  type TimerEdge,
  type TimerPosition,
  type TimerRect,
  timerEdge,
} from "./timer-position";

const OBSTACLES =
  '[data-testid="step-one-onboarding-trigger"], [data-testid="board-control-hud"], [data-testid="board-context-hud"], [data-testid="board-location-card"], [data-testid="private-notes-toolbar"], [data-testid="canvas-zoom-hud"], [data-testid="board-tools-hud"], [data-testid="idea-map-size-controls-hud"], [data-testid="board-connection-status"], [data-private-writing-hint] [data-testid="board-character-bubble"]';
/**
 * 端へ寄せるときだけ避ける、画面の上下中央の案内。
 * 初期配置（右上）とマイ付箋の段組みには関わらないので、通常の配置計算には含めない。
 */
const SNAP_OBSTACLES =
  '[data-testid="phase-step-trail"], [data-testid="board-character"], [data-testid="board-character-bubble"], [data-testid="sharing-current-presenter"], [data-testid="phase-loop-hud"] > *';
/**
 * 個人ステップのマイ付箋は作業領域のほぼ全体を占める。面ごと避けるとどの端にも空きが無いので、
 * 動かした後は面の代わりに入力欄と付箋を避ける。
 */
const WORKSPACE_TOOLBAR =
  '[data-testid="private-notes-toolbar"][data-presentation="workspace"]:not([data-expanded="false"])';
const WORKSPACE_CONTENT =
  '[data-testid="private-notes-controls"], [data-private-note-composer], [data-testid="note-card"], [data-testid="private-note-placeholder"], [data-testid^="example-note-"]';
const MIN_PRIVATE_COMPOSER_WIDTH = 192;
const PRIVATE_WRITING_HEADER_SPACE = 136;
/** 端へ寄る動きの印を外すまでの時間。room-timer.module.css の transition（200ms）より少し長くする */
const SNAP_SETTLE_MS = 240;

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

  const snapTimeout = useRef(0);
  /** ドラッグで寄せた辺。再配置でも同じ辺に付け直す。キー移動で外す */
  const snappedEdge = useRef<TimerEdge | null>(null);
  const stopSnapMotion = () => {
    window.clearTimeout(snapTimeout.current);
    if (ref.current) delete ref.current.dataset.snapping;
  };

  const layout = (
    width = targetRef.current,
    settle = true,
    dropped = false,
  ) => {
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
    const rowBottom = initial.top + 84;
    root?.style.setProperty(
      "--board-timer-row-bottom",
      `${rowBottom - bounds.top}px`,
    );
    if (root && settle) {
      const header = root.querySelector<HTMLElement>(
        '[data-presentation="workspace"] [data-testid="private-notes-header"]:has([data-private-note-composer])',
      );
      const headerBounds = header?.getBoundingClientRect();
      const timerLeft = initial.right - width;
      const endInset = headerBounds
        ? Math.max(0, Math.ceil(headerBounds.right - timerLeft + 12))
        : 0;
      const fitsBesideTimer =
        !header ||
        !headerBounds ||
        endInset === 0 ||
        headerBounds.width -
          endInset -
          Number.parseFloat(getComputedStyle(header).paddingInlineStart) >=
          MIN_PRIVATE_COMPOSER_WIDTH;
      // 入力欄と付箋1段の高さが残るスマホでは、タイマーの下を入力に使う。
      const workspaceBottom =
        header?.parentElement?.getBoundingClientRect().bottom ?? rowBottom;
      const hasRoomBelowTimer =
        window.innerWidth < 640 &&
        workspaceBottom - rowBottom >=
          PRIVATE_WRITING_HEADER_SPACE + NOTE_HEIGHT;
      const needsTimerRow = hasRoomBelowTimer || !fitsBesideTimer;
      root.style.setProperty(
        "--board-private-timer-inset",
        `${needsTimerRow ? 0 : endInset}px`,
      );
      root.style.setProperty(
        "--board-private-timer-top",
        `${needsTimerRow ? rowBottom : 0}px`,
      );
    }
    const obstacles: TimerRect[] = obstacleNodes
      .flatMap((node) => {
        if (node.dataset.testid !== "private-notes-toolbar") return [node];
        if (!moved.current) return [];
        if (!node.matches(WORKSPACE_TOOLBAR)) return [node];
        return Array.from(
          node.querySelectorAll<HTMLElement>(WORKSPACE_CONTENT),
        ).filter((item) => item.offsetWidth > 0 && item.offsetHeight > 0);
      })
      .map((node) => node.getBoundingClientRect());
    const snap =
      settle && moved.current && (dropped || snappedEdge.current !== null);
    if (snap)
      for (const node of root?.querySelectorAll<HTMLElement>(SNAP_OBSTACLES) ??
        [])
        if (node.offsetWidth > 0 && node.offsetHeight > 0)
          obstacles.push(node.getBoundingClientRect());
    if (!position.current || !moved.current) position.current = initial;
    if (snap) {
      position.current = snapRoomTimer(
        position.current,
        width,
        bounds,
        obstacles,
        dropped ? undefined : (snappedEdge.current ?? undefined),
      );
      snappedEdge.current = timerEdge(position.current, width, bounds);
    } else if (settle)
      position.current = placeRoomTimer(
        position.current,
        width,
        bounds,
        obstacles,
      );
    if (dropped) {
      // 離した位置から端までを滑らかに移す。動きを減らす設定では CSS 側で即座に移る。
      element.dataset.snapping = "true";
      window.clearTimeout(snapTimeout.current);
      snapTimeout.current = window.setTimeout(() => {
        delete element.dataset.snapping;
      }, SNAP_SETTLE_MS);
    }
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
    const observeObstacles = () => {
      if (!root) return;
      observer?.disconnect();
      observer?.observe(root);
      for (const node of root.querySelectorAll<HTMLElement>(OBSTACLES))
        observer?.observe(node);
    };
    observeObstacles();
    const mutations = root
      ? new MutationObserver(() => {
          observeObstacles();
          update();
        })
      : null;
    if (root) mutations?.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    // 案内の吹き出しは縮んだ状態から広がって出る。広がり終えた大きさで測り直す
    root?.addEventListener("animationend", update);
    return () => {
      root?.removeEventListener("animationend", update);
      window.clearTimeout(snapTimeout.current);
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener("resize", update);
      root?.style.removeProperty("--board-timer-row-bottom");
      root?.style.removeProperty("--board-private-timer-inset");
      root?.style.removeProperty("--board-private-timer-top");
    };
  }, [ref]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !position.current) return;
    // 寄っている途中に掴み直したら、動きを止めて指に付ける
    stopSnapMotion();
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
    const dropped = drag.current.active;
    drag.current = null;
    setDragging(false);
    // ドラッグして離したときだけ、作業領域の最寄りの端へ寄せる
    layoutRef.current(undefined, true, dropped);
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
    snappedEdge.current = null;
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

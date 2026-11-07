import { useEffect, useRef } from "react";

/** Views reachable by a two-finger swipe, in order. Dashboard and Calendar are left out. */
export const SWIPE_VIEWS = ["notes", "study", "mindmap", "bookmarks", "bookshelf"] as const;
export type SwipeView = (typeof SWIPE_VIEWS)[number];
export const SWIPE_LABELS: Record<SwipeView, string> = {
  notes: "Notes",
  study: "Study Desk",
  mindmap: "Mindmaps",
  bookmarks: "Bookmarks",
  bookshelf: "Bookshelf",
};

/** Next view in the given direction, or null at either end (no wrap-around). */
export function nextView(current: string, direction: 1 | -1): SwipeView | null {
  const at = SWIPE_VIEWS.indexOf(current as SwipeView);
  if (at < 0) return null;
  return SWIPE_VIEWS[at + direction] ?? null;
}

/** Content that already uses sideways movement keeps it: open maps, readers, wide tables, code. */
function ownsSideways(target: EventTarget | null) {
  let el = target instanceof Element ? (target as HTMLElement) : null;
  if (!el) return true;
  if (!el.closest("main") || el.closest(".topbar, [role=dialog], [data-no-view-swipe]")) return true;
  if (el.closest(".book-reader, .reader, .mindmap-canvas, .mindmap-stage")) return true;
  const main = el.closest("main")!;
  for (; el && el !== main; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

/**
 * Two fingers left or right on the page (trackpad, or two fingers on a touch screen)
 * moves along SWIPE_VIEWS. `allowed` says whether the current page is a list page.
 */
export function useViewSwipe(tab: string, allowed: () => boolean, go: (view: SwipeView) => void) {
  const state = useRef({ tab, allowed, go });
  state.current = { tab, allowed, go };
  useEffect(() => {
    let sum = 0,
      locked = false,
      idle: ReturnType<typeof setTimeout> | undefined;
    const fire = (direction: 1 | -1, target: EventTarget | null) => {
      const { tab, allowed, go } = state.current;
      if (!allowed() || ownsSideways(target)) return false;
      const next = nextView(tab, direction);
      if (next) go(next);
      return !!next;
    };
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5) return;
      clearTimeout(idle);
      // One gesture moves one view; wait for the trackpad's momentum to stop.
      idle = setTimeout(() => {
        sum = 0;
        locked = false;
      }, 260);
      if (locked) return;
      sum += e.deltaX;
      if (Math.abs(sum) > 160) {
        locked = true;
        fire(sum > 0 ? 1 : -1, e.target);
        sum = 0;
      }
    };
    let start: { x: number; y: number; d: number; target: EventTarget | null } | null = null,
      last: { x: number; y: number; d: number } | null = null;
    const point = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
      d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY),
    });
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        start = { ...point(e.touches), target: e.target };
        last = null;
      } else if (e.touches.length > 2) start = null;
    };
    const touchMove = (e: TouchEvent) => {
      if (start && e.touches.length === 2) last = point(e.touches);
    };
    const touchEnd = () => {
      if (start && last) {
        const dx = last.x - start.x,
          dy = last.y - start.y,
          pinch = Math.abs(last.d - start.d) / Math.max(1, start.d) > 0.25;
        if (!pinch && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) fire(dx < 0 ? 1 : -1, start.target);
      }
      start = null;
      last = null;
    };
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: true });
    window.addEventListener("touchend", touchEnd, { passive: true });
    window.addEventListener("touchcancel", touchEnd, { passive: true });
    return () => {
      clearTimeout(idle);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", touchEnd);
    };
  }, []);
}

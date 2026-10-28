import { useEffect, type RefObject } from "react";
import { animate } from "motion/mini";

const entrances = {
  content: { opacity: [0.75, 1], transform: ["translateY(4px)", "none"] },
  reveal: { opacity: [0.6, 1], transform: ["translateY(6px)", "none"] },
  popover: { opacity: [0.6, 1], transform: ["translateY(-4px)", "none"] },
  dialog: { opacity: [0.6, 1], transform: ["translateY(8px) scale(0.99)", "none"] },
};

/** Animate existing surfaces without remounting editors or delaying focus/interaction. */
export function useEntranceMotion<T extends HTMLElement>(
  ref: RefObject<T | null>, trigger: unknown,
  { selector, kind = "content", active = true }: { selector?: string; kind?: keyof typeof entrances; active?: boolean } = {},
) {
  useEffect(() => {
    const root = ref.current, preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!active || !root || !preference || preference.matches) return;
    const elements = (selector ? [...root.querySelectorAll<HTMLElement>(selector)] : [root])
      .filter(element => typeof element.animate === "function");
    if (!elements.length) return;
    const original = elements.map(element => ({ element, opacity: element.style.opacity, transform: element.style.transform }));
    const restore = () => original.forEach(({ element, opacity, transform }) => {
      element.style.opacity = opacity;
      element.style.transform = transform;
    });
    let disposed = false;
    const controls = animate(elements, entrances[kind], {
      duration: kind === "dialog" ? 0.2 : kind === "popover" ? 0.14 : 0.18,
      ease: [0.22, 1, 0.36, 1],
    });
    void controls.then(() => { if (!disposed) restore(); });
    const cancel = () => { disposed = true; controls.cancel(); restore(); };
    const change = () => { if (preference.matches) cancel(); };
    preference.addEventListener?.("change", change);
    return () => { preference.removeEventListener?.("change", change); cancel(); };
  }, [ref, trigger, selector, kind, active]);
}

import confetti from "canvas-confetti";
import { useEffect, useRef, type RefObject } from "react";

const colors = ["#62c9a5", "#f2c66d", "#a69be2", "#80c7df"];

/** Own the canvas inside the study root so celebrations also work in fullscreen. */
export function useStudyConfetti(root: RefObject<HTMLElement | null>, active: boolean, run: string | null, cardId: string | null, complete: boolean) {
  const animation = useRef<{ fire: confetti.CreateTypes; canvas: HTMLCanvasElement } | null>(null);
  const previous = useRef({ active, run, complete });
  const celebratedRun = useRef<string | null>(null);
  const stop = () => {
    try {
      animation.current?.fire.reset();
    } catch {}
    try {
      animation.current?.canvas.remove();
    } catch {}
    animation.current = null;
  };
  const launch = (options: confetti.Options[]) => {
    if (!active || !root.current || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = document.createElement("canvas");
    let ctx = null;
    try {
      ctx = canvas.getContext?.("2d");
    } catch {}
    if (!ctx) return;
    stop();
    canvas.className = "study-confetti";
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "150" });
    root.current.appendChild(canvas);
    const fire = confetti.create(canvas, { resize: true, disableForReducedMotion: true });
    const current = { fire, canvas };
    animation.current = current;
    try {
      const bursts = options.map(options => fire({ colors, shapes: ["square", "circle"], disableForReducedMotion: true, ...options }));
      void Promise.all(bursts).then(() => {
        if (animation.current === current) stop();
      }).catch(() => { if (animation.current === current) stop(); });
    } catch {
      // Decorative feedback must never interrupt an answer or saved progress.
      stop();
    }
  };

  useEffect(() => stop, [active, run, cardId]);
  useEffect(() => {
    const before = previous.current;
    previous.current = { active, run, complete };
    if (active && complete && run && before.active && before.run === run && !before.complete && celebratedRun.current !== run) {
      celebratedRun.current = run;
      const compact = window.innerWidth < 760;
      launch([0.18, 0.82].map(x => ({
        particleCount: compact ? 45 : 70, angle: x < 0.5 ? 65 : 115,
        spread: 65, startVelocity: compact ? 30 : 40, gravity: 1.05,
        decay: 0.93, ticks: 170, scalar: 0.9, origin: { x, y: 0.72 },
      })));
    }
  }, [active, run, complete]);

  return (option: HTMLElement) => {
    const bounds = option.getBoundingClientRect();
    launch([{
      particleCount: 28, spread: 65, startVelocity: 19, gravity: 0.95,
      decay: 0.91, ticks: 85, scalar: 0.7, colors: colors.slice(0, 2),
      origin: { x: Math.max(0, Math.min(1, (bounds.left + bounds.width / 2) / window.innerWidth)), y: Math.max(0, Math.min(1, bounds.top / window.innerHeight)) },
    }]);
  };
}

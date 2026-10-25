import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Fullscreen is requested only from a study-button gesture; focus view is the fallback. */
export function useImmersiveStudy(active: boolean) {
  const rootRef = useRef<HTMLElement>(null),
    [immersive, setImmersive] = useState(false),
    [fullscreenNotice, setFullscreenNotice] = useState(""),
    enabled = useRef(false),
    native = useRef(false),
    lastNativeExit = useRef(0),
    generation = useRef(0),
    previousFocus = useRef<HTMLElement | null>(null);

  const exitImmersive = () => {
    generation.current++;
    enabled.current = false;
    native.current = false;
    setImmersive(false);
    setFullscreenNotice("");
    const fullscreen = document.fullscreenElement;
    if (fullscreen && (rootRef.current?.contains(fullscreen)||fullscreen===rootRef.current?.closest('.app')))
      void document.exitFullscreen?.().catch(() => {});
  };
  const enterImmersive = () => {
    const root = rootRef.current;
    if (!root || enabled.current) return;
    const request = ++generation.current;
    previousFocus.current = document.activeElement as HTMLElement | null;
    enabled.current = true;
    setImmersive(true);
    setFullscreenNotice("");
    const nativeRoot=(document.querySelector('.music-floating')?root.closest('.app'):root) as HTMLElement || root;
    if (!nativeRoot.requestFullscreen) {
      setFullscreenNotice("Focus view is on. Fullscreen isn’t available in this browser.");
      return;
    }
    // Keep this call in the click handler so the browser retains user activation.
    try {
      void nativeRoot.requestFullscreen({ navigationUI: "hide" }).then(() => {
        if (request !== generation.current || !enabled.current) {
          if (document.fullscreenElement === nativeRoot) void document.exitFullscreen?.().catch(() => {});
        } else native.current = true;
      }).catch(() => {
        if (request === generation.current && enabled.current)
          setFullscreenNotice("Focus view is on. Your browser couldn’t enter fullscreen.");
      });
    } catch {
      setFullscreenNotice("Focus view is on. Your browser couldn’t enter fullscreen.");
    }
  };

  useEffect(() => {
    const change = () => {
      const fullscreen = document.fullscreenElement;
      if (fullscreen && (rootRef.current?.contains(fullscreen)||fullscreen===rootRef.current?.closest('.app'))) native.current = true;
      else if (enabled.current && native.current) {
        lastNativeExit.current = Date.now();
        enabled.current = false;
        native.current = false;
        generation.current++;
        setImmersive(false);
        setFullscreenNotice("");
      }
    };
    document.addEventListener("fullscreenchange", change);
    const root = rootRef.current;
    return () => {
      document.removeEventListener("fullscreenchange", change);
      generation.current++;
      enabled.current = false;
      if (root && document.fullscreenElement && (root.contains(document.fullscreenElement)||document.fullscreenElement===root.closest('.app')))
        void document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  useEffect(() => { if (!active && enabled.current) exitImmersive(); }, [active]);

  useLayoutEffect(() => {
    if (!immersive || !active || !rootRef.current) return;
    const root = rootRef.current,
      outside: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = root;
    // Keep background navigation out of the keyboard/accessibility path in focus fallback too.
    while (branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of [...parent.children]) {
        if (sibling !== branch && sibling instanceof HTMLElement && !sibling.classList.contains("music-player-host")) {
          outside.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      if (parent === document.body) break;
      branch = parent;
    }
    root.querySelector<HTMLElement>(".study-dock-main button:not(:disabled)")?.focus({ preventScroll: true });
    const trapFocus = (event: KeyboardEvent) => {
      if (root.querySelector('dialog[open]')) return;
      if (event.key !== "Tab") return;
      const controls = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), iframe, [tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0 && !element.closest("[hidden], [inert]")),
        first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); root.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    root.addEventListener("keydown", trapFocus);
    return () => {
      root.removeEventListener("keydown", trapFocus);
      for (const { element, inert } of outside) element.inert = inert;
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
      else root.querySelector<HTMLElement>(".immersive-toggle")?.focus({ preventScroll: true });
    };
  }, [immersive, active]);

  return { rootRef, immersive, fullscreenNotice, enterImmersive, exitImmersive, lastNativeExit };
}

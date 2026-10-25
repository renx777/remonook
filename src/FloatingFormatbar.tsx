import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";

/** A selection-only bubble: never show formatting for a caret or an empty bullet. */
export function FloatingFormatbar({ editor, children }: { editor: Editor | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const dismissed = useRef<string | null>(null);
  const selecting = useRef(false);
  const focusRequested = useRef(false);
  const [placement, setPlacement] = useState({ left: 8, top: 8, below: false, visible: false });
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      const selection = editor.state.selection;
      const signature = `${selection.from}:${selection.to}`;
      if (selection.empty) dismissed.current = null;
      if (selection.empty || selecting.current || !editor.isEditable || !editor.state.doc.textBetween(selection.from, selection.to, " ").trim() || dismissed.current === signature) {
        setPlacement(previous => previous.visible ? { ...previous, visible: false } : previous);
        ref.current?.querySelectorAll("details[open]").forEach(element => element.removeAttribute("open"));
        return;
      }
      dismissed.current = null;
      frame = requestAnimationFrame(() => {
        const bar = ref.current;
        if (!bar || editor.isDestroyed) return;
        const view = editor.view;
        const { from, to } = editor.state.selection;
        if (from === to || selecting.current || dismissed.current === `${from}:${to}`) return;
        const viewport = window.visualViewport;
        const minX = (viewport?.offsetLeft || 0) + 8;
        const minY = (viewport?.offsetTop || 0) + 8;
        const maxX = minX + (viewport?.width || window.innerWidth) - 16;
        const maxY = minY + (viewport?.height || window.innerHeight) - 16;
        const area = view.dom.closest(".outline-scroll")?.getBoundingClientRect();
        let first, last;
        try {
          first = view.coordsAtPos(from);
          last = view.coordsAtPos(to);
        } catch {
          // Non-layout environments (e.g. document previews) expose no caret rects.
          first = last = view.dom.getBoundingClientRect();
        }
        const focused = editor.isFocused || bar.contains(document.activeElement);
        const visible = focused && last.bottom >= Math.max(minY, area?.top || minY) && first.top <= Math.min(maxY, area?.bottom || maxY);
        bar.hidden = !visible;
        const width = bar.offsetWidth, height = bar.offsetHeight;
        const below = first.top - height - 10 < Math.max(minY, area?.top || minY);
        const anchorLeft = (first.left + (first.top === last.top ? last.right : first.right)) / 2 - width / 2;
        const left = Math.max(minX, Math.min(anchorLeft, maxX - width));
        const top = Math.max(minY, Math.min(below ? last.bottom + 10 : first.top - height - 10, maxY - height));
        setPlacement({ left, top, below, visible });
        if (visible && focusRequested.current) {
          focusRequested.current = false;
          bar.style.visibility = "visible";
          bar.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
        }
      });
    };
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    editor.on("focus", update);
    editor.on("blur", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    const focusToolbar = (event: KeyboardEvent) => {
      if (event.altKey && event.key === "F10" && editor.isFocused && !editor.state.selection.empty) {
        event.preventDefault();
        dismissed.current = null;
        focusRequested.current = true;
        update();
      }
    };
    window.addEventListener("keydown", focusToolbar);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && editor.view.dom.contains(event.target)) {
        selecting.current = true;
        setPlacement(previous => ({ ...previous, visible: false }));
        dismissed.current = null;
      }
      if (event.target instanceof Node && !ref.current?.contains(event.target) && !editor.view.dom.contains(event.target)) {
        setPlacement(previous => ({ ...previous, visible: false }));
        dismissed.current = `${editor.state.selection.from}:${editor.state.selection.to}`;
      }
    };
    const finishSelecting = () => { selecting.current = false; update(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("pointerup", finishSelecting);
    document.addEventListener("pointercancel", finishSelecting);
    if (ref.current) observer?.observe(ref.current);
    observer?.observe(editor.view.dom);
    update();
    return () => {
      cancelAnimationFrame(frame);
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      editor.off("focus", update);
      editor.off("blur", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      observer?.disconnect();
      window.removeEventListener("keydown", focusToolbar);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("pointerup", finishSelecting);
      document.removeEventListener("pointercancel", finishSelecting);
    };
  }, [editor]);
  return <div ref={ref} className="formatbar floating-formatbar" role="toolbar" aria-label="Text formatting" hidden={!placement.visible}
    data-placement={placement.below ? "below" : "above"}
    style={{ left: placement.left, top: placement.top, visibility: placement.visible ? "visible" : "hidden" }}
    onMouseDown={event => { if (!(event.target instanceof HTMLElement && event.target.matches('input, select, option'))) event.preventDefault(); }}
    onKeyDown={event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        ref.current?.querySelectorAll("details[open]").forEach(el => el.removeAttribute("open"));
        editor?.commands.focus();
        dismissed.current = editor ? `${editor.state.selection.from}:${editor.state.selection.to}` : null;
        setPlacement(previous => ({ ...previous, visible: false }));
      }
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && !(event.target instanceof HTMLInputElement)) {
        const controls = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), summary, input:not(:disabled)") || [])].filter(el => el.getClientRects().length > 0);
        const at = controls.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + controls.length) % controls.length;
        event.preventDefault();
        controls[next]?.focus();
      }
    }}>
    {children}
  </div>;
}

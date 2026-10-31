import {usePalettePosition} from './usePalettePosition';
import type { Editor } from "@tiptap/core";
import { useRef, useState } from "react";
import { textColors, highlightColors } from "./color-palettes";
const textSwatchSurface = (value: string) => value.toUpperCase() === 'FFFFFF' ? '#303038' : value.toUpperCase() === '202124' ? '#f4f4f5' : 'var(--bg)';
export function FormattingPalette({ editor, disabled, mode = "text", allowCaret = false }: { editor: Editor | null; disabled: boolean; mode?: "text" | "highlight"; allowCaret?: boolean }) {
  const details = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState("");
  const [recent, setRecent] = useState<string[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem(`remo-colors-${mode}`) || "[]"); return Array.isArray(saved) ? saved.filter(value => typeof value === "string" && /^[a-f0-9]{6}$/i.test(value)).slice(0, 6) : []; } catch { return []; }
  });
  const isHighlight = mode === "highlight", mark = isHighlight ? "remoHighlight" : "remoColor";
  const colors = isHighlight ? highlightColors : textColors;
  const selectedColor = recent[0] || editor?.getAttributes(mark).value;
  usePalettePosition(open, details, panel);
  const apply = (value?: string) => {
    if (!editor || disabled || (!allowCaret && editor.state.selection.empty)) return;
    const chain = editor.chain().focus();
    if (value) chain.setMark(mark, { value }).run(); else chain.unsetMark(mark).run();
    if (value) {
      const next = [value, ...recent.filter(color => color !== value)].slice(0, 6);
      setRecent(next);
      try { localStorage.setItem(`remo-colors-${mode}`, JSON.stringify(next)); } catch {}
    }
    if (details.current) details.current.open = false;
  };
  return <div className="format-palette-split"><button type="button" className="palette-apply" aria-label={isHighlight ? "Apply last highlight color" : "Apply last text color"} title={isHighlight ? "Apply last highlight color" : "Apply last text color"} disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>apply(recent[0] || (isHighlight?'FFE082':'202124'))}><span className={`palette-trigger-letter ${isHighlight ? "highlight-trigger" : ""}`} style={isHighlight ? { backgroundColor: `#${selectedColor || "FFE082"}` } : { color: selectedColor ? `#${selectedColor}` : undefined, borderBottomColor: selectedColor ? `#${selectedColor}` : undefined }} aria-hidden="true">{isHighlight ? "H" : "A"}</span></button><details ref={details} className="format-palette" onToggle={event => setOpen(event.currentTarget.open)}><summary aria-label={isHighlight ? "Highlight color" : "Text color"} title={isHighlight ? "Choose highlight color" : "Choose text color"} onClick={event => { if (disabled) event.preventDefault(); }}><svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg></summary>
    {open&&<div ref={panel} className="palette-popover" onMouseDown={e => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}>
      <div className="palette-panel-heading"><strong>{isHighlight ? "Highlight" : "Text color"}</strong><span>24 colors</span></div>
      <div className="palette-swatches color-grid" role="group" aria-label={isHighlight ? "Highlight options" : "Text color options"}>
        {colors.map(([name, value]) => <button key={value} className={isHighlight ? "" : "text-color-swatch"} disabled={disabled} aria-label={`${name} ${isHighlight ? "highlight" : "text"}`} aria-pressed={selectedColor===value} title={name} onMouseEnter={() => setHovered(name)} onMouseLeave={() => setHovered("")} onFocus={() => setHovered(name)} style={isHighlight ? { background: `#${value}`, color: "#202124" } : { background: textSwatchSurface(value), color: `#${value}` }} onClick={() => apply(value)}>{isHighlight ? selectedColor===value ? "✓" : "" : <><span aria-hidden="true">A</span>{selectedColor===value && <span className="swatch-selected" aria-hidden="true">✓</span>}</>}</button>)}
      </div>
      {!!recent.length && <><span className="palette-heading">Recently used</span><div className="palette-swatches recent-colors">{recent.map(value => <button key={value} className={isHighlight ? "" : "text-color-swatch"} disabled={disabled} aria-label={`Recent ${isHighlight ? "highlight" : "text"} ${value}`} title={`#${value}`} style={isHighlight ? { background: `#${value}` } : { background: textSwatchSurface(value), color: `#${value}` }} onClick={() => apply(value)}>{isHighlight ? "" : "A"}</button>)}</div></>}
      <div className="palette-panel-footer"><button disabled={disabled} onClick={() => apply()}>{isHighlight ? "Remove highlight" : "Default text color"}</button><span aria-live="polite">{hovered || (isHighlight ? "H · Highlight" : "A · Text")}</span></div>
    </div>}</details></div>;
}

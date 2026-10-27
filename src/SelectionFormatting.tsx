import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { FloatingFormatbar } from "./FloatingFormatbar";
import { Icon } from "./icons";
import { FormattingPalette } from "./FormattingPalette";
import {RoughAnnotationPicker} from './RoughAnnotationPicker';
import { textColors } from "./color-palettes";

const tools = [
  { mark: "bold", label: "Bold", shortcut: "Ctrl/⌘ B", glyph: <Icon name="bold" size={17}/> },
  { mark: "italic", label: "Italic", shortcut: "Ctrl/⌘ I", glyph: <Icon name="italic" size={17}/> },
  { mark: "underline", label: "Underline", shortcut: "Ctrl/⌘ U", glyph: <Icon name="underline" size={17}/> },
  { mark: "remoMask", label: "Mask text", shortcut: "Ctrl/⌘ Shift M · hover to reveal", glyph: <Icon name="mask" size={17} /> },
  { mark: "code", label: "Inline code", shortcut: "Ctrl/⌘ E", glyph: <Icon name="code" size={17}/> },
];

export function DividerColorPicker({
  color,
  disabled,
  onChange,
}: {
  color?: string;
  disabled: boolean;
  onChange: (color: string) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const activeColor = color || "";

  useLayoutEffect(() => {
    if (!open) return;
    document.querySelectorAll<HTMLDetailsElement>(".format-palette[open]").forEach(element => {
      if (element !== details.current) element.open = false;
    });
    const place = () => {
      const anchor = details.current?.querySelector("summary")?.getBoundingClientRect();
      const popover = panel.current;
      if (!anchor || !popover) return;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      const fitsBelow = anchor.bottom + popover.offsetHeight + 12 <= top + height - 8;
      Object.assign(popover.style, {
        position: "fixed", right: "auto", bottom: "auto",
        left: `${Math.max(left + 8, Math.min(anchor.left, left + width - popover.offsetWidth - 8))}px`,
        top: `${Math.max(top + 8, Math.min(fitsBelow ? anchor.bottom + 12 : anchor.top - popover.offsetHeight - 12, top + height - popover.offsetHeight - 8))}px`,
      });
    };
    const dismiss = (event: PointerEvent) => {
      if (details.current && event.target instanceof globalThis.Node && !details.current.contains(event.target)) {
        details.current.open = false;
      }
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [open]);

  return (
    <details
      ref={details}
      className="format-palette divider-color-palette"
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary
        className="selection-tool divider-color-summary"
        aria-label="Divider color"
        title="Choose divider color"
        onClick={event => {
          if (disabled) event.preventDefault();
        }}
      >
        <span
          className="divider-color-swatch-preview"
          style={{
            backgroundColor: activeColor || "var(--line)",
            border: activeColor ? "1px solid rgba(0,0,0,0.25)" : "1px dashed var(--muted)",
          }}
          aria-hidden="true"
        />
        <svg width="8" height="8" viewBox="0 0 12 12" aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </summary>
      <div
        ref={panel}
        className="palette-popover divider-color-popover"
        onMouseDown={e => {
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        <div className="palette-panel-heading">
          <strong>Divider color</strong>
          <span>{textColors.length} colors</span>
        </div>
        <div className="palette-swatches color-grid" role="group" aria-label="Divider color options">
          {textColors.map(([name, hex]) => {
            const val = "#" + hex;
            const selected = activeColor.toLowerCase() === val.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                className="text-color-swatch divider-swatch-btn"
                disabled={disabled}
                aria-label={`${name} divider`}
                aria-pressed={selected}
                title={name}
                style={{ background: val, color: hex.toUpperCase() === "FFFFFF" ? "#202124" : "#FFFFFF" }}
                onClick={() => {
                  onChange(val);
                  if (details.current) details.current.open = false;
                }}
              >
                {selected && <span className="swatch-selected" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
        <div className="palette-panel-footer">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange("");
              if (details.current) details.current.open = false;
            }}
          >
            Default color
          </button>
        </div>
      </div>
    </details>
  );
}

export function SelectionFormatting({
  editor,
  disabled,
  blockStyle = "paragraph",
  onBlock,
  dividerStyle,
  dividerColor,
  onDividerStyle,
  onDividerColor,
}: {
  editor: Editor | null;
  disabled: boolean;
  blockStyle?: string;
  onBlock?: (style: string) => void;
  dividerStyle?: string;
  dividerColor?: string;
  onDividerStyle?: (style: string) => void;
  onDividerColor?: (color: string) => void;
}) {
  const [, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    if (!editor) return;
    const update = () => refresh();
    editor.on("transaction", update);
    return () => { editor.off("transaction", update); };
  }, [editor]);
  return (
    <FloatingFormatbar editor={editor}>
      {onBlock && (
        <select
          className="selection-block-style"
          aria-label="Text block style"
          value={['paragraph', 'h1', 'h2', 'h3', 'quote', 'divider'].includes(blockStyle) ? blockStyle : 'paragraph'}
          disabled={disabled}
          onChange={event => onBlock(event.target.value)}
        >
          <option value="paragraph">Paragraph</option>
          <option value="h1">H1</option>
          <option value="h2">H2</option>
          <option value="h3">H3</option>
          <option value="quote">Quote</option>
          <option value="divider">Divider</option>
        </select>
      )}
      {blockStyle === "divider" && (
        <>
          <span className="selection-divider" aria-hidden="true" />
          <select
            className="selection-divider-style"
            aria-label="Divider line style"
            value={dividerStyle || "straight"}
            disabled={disabled}
            onChange={event => onDividerStyle?.(event.target.value)}
          >
            <option value="straight">Straight line</option>
            <option value="squiggly">Squiggly line</option>
            <option value="dotted">Dotted line</option>
          </select>
          <DividerColorPicker
            color={dividerColor}
            disabled={disabled}
            onChange={color => onDividerColor?.(color)}
          />
        </>
      )}
      <span className="selection-divider" aria-hidden="true" />
      <div className="selection-tools" role="group" aria-label="Text style">
        {tools.map(tool => (
          <button
            key={tool.mark}
            type="button"
            className="selection-tool"
            aria-label={tool.label}
            title={`${tool.label} · ${tool.shortcut}`}
            aria-pressed={editor?.isActive(tool.mark) || false}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleMark(tool.mark).run()}
          >
            {tool.glyph}
          </button>
        ))}
      </div>
      <span className="selection-divider" aria-hidden="true" />
      <FormattingPalette editor={editor} disabled={disabled} />
      <FormattingPalette editor={editor} disabled={disabled} mode="highlight" />
      <RoughAnnotationPicker editor={editor} disabled={disabled}/>
      <span className="selection-divider" aria-hidden="true" />
      <button
        type="button"
        className="selection-tool selection-clear"
        aria-label="Clear formatting"
        title="Clear formatting"
        disabled={disabled}
        onClick={() => editor?.chain().focus().unsetAllMarks().run()}
      >
        <Icon name="clearFormat" size={17}/>
      </button>
    </FloatingFormatbar>
  );
}

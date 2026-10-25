import { useEffect, useReducer } from "react";
import type { Editor } from "@tiptap/core";
import { FloatingFormatbar } from "./FloatingFormatbar";
import { Icon } from "./icons";
import { FormattingPalette } from "./FormattingPalette";

const tools = [
  { mark: "bold", label: "Bold", shortcut: "Ctrl/⌘ B", glyph: <b>B</b> },
  { mark: "italic", label: "Italic", shortcut: "Ctrl/⌘ I", glyph: <i>I</i> },
  { mark: "underline", label: "Underline", shortcut: "Ctrl/⌘ U", glyph: <u>U</u> },
  { mark: "remoMask", label: "Mask text", shortcut: "Ctrl/⌘ Shift M · hover to reveal", glyph: <Icon name="mask" size={17} /> },
  { mark: "code", label: "Inline code", shortcut: "Ctrl/⌘ E", glyph: <span className="selection-code-icon">&lt;/&gt;</span> },
];

export function SelectionFormatting({ editor, disabled, blockStyle = 'paragraph', onBlock }: { editor: Editor | null; disabled: boolean; blockStyle?: string; onBlock?: (style: string) => void }) {
  const [, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    if (!editor) return;
    const update = () => refresh();
    editor.on("transaction", update);
    return () => { editor.off("transaction", update); };
  }, [editor]);
  return <FloatingFormatbar editor={editor}>
    {onBlock && <select className="selection-block-style" aria-label="Text block style" value={blockStyle === 'divider' ? 'paragraph' : blockStyle} disabled={disabled} onChange={event => onBlock(event.target.value)}><option value="paragraph">Paragraph</option><option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option><option value="quote">Quote</option><option value="divider">Divider</option></select>}
    <div className="selection-tools" role="group" aria-label="Text style">
      {tools.map(tool => <button key={tool.mark} type="button" className="selection-tool" aria-label={tool.label} title={`${tool.label} · ${tool.shortcut}`}
        aria-pressed={editor?.isActive(tool.mark) || false} disabled={disabled}
        onClick={() => editor?.chain().focus().toggleMark(tool.mark).run()}>{tool.glyph}</button>)}
    </div>
    <span className="selection-divider" aria-hidden="true" />
    <FormattingPalette editor={editor} disabled={disabled} />
    <FormattingPalette editor={editor} disabled={disabled} mode="highlight" />
    <span className="selection-divider" aria-hidden="true" />
    <button type="button" className="selection-tool selection-clear" aria-label="Clear formatting" title="Clear formatting" disabled={disabled}
      onClick={() => editor?.chain().focus().unsetAllMarks().run()}><span aria-hidden="true">T<span className="selection-clear-slash">╱</span></span></button>
  </FloatingFormatbar>;
}

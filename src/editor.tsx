import {Icon} from './icons';
import {useVisualTools} from './VisualTools';
import {NoteTable} from './NoteTable';
import {readTable} from './table.mjs';
import { memo, useEffect, useRef, useState } from "react";
import type { ClipboardInput } from "./clipboard";
import {ConnectedText,InlineConnections} from "./Connections";
import {tagHighlight} from "./TagHighlight";
import {noteLinks} from "./relations.mjs";
import { SlashMenu } from "./SlashMenu";
import { CodeRead, codeHighlight, codeLanguages } from "./CodeBlock";
import { InlineEmojiPicker } from './InlineEmojiPicker';
import { Editor, Mark, type JSONContent } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { marks, encode } from "./domain.mjs";
import type { Node } from "./data";
import { EmojiText,useEmojiLibrary } from './AnimatedEmoji';
import {editorEmoji} from './EditorEmoji';
import {RemoRough,RoughAnnotation} from './RoughAnnotation';
import {parseRoughStyle,roughStyle} from './rough-annotations.mjs';
import { Notation, notationParts } from './Notation';
export { notationParts } from './Notation';
/** Apply source-range formatting to the rendered equation as one visual unit. */
export function notationFormatting(node: Node, start: number, end: number) {
  const styles = marks(node.formatting, node.text.length)
    .filter((mark: any) => mark.start < end && mark.end > start)
    .map((mark: any) => mark.style as string);
  const color = styles.find((style: string) => style.startsWith("COLOR_"));
  const highlight = styles.find((style: string) => style.startsWith("HIGHLIGHT"));
  return {
    color: color ? `#${color.slice(6)}` : highlight ? "#18181b" : undefined,
    backgroundColor: highlight ? `#${highlight.includes("_") ? highlight.slice(10) : "FFE082"}` : undefined,
    fontWeight: styles.includes("BOLD") ? 700 : undefined,
    fontStyle: styles.includes("ITALIC") ? "italic" : undefined,
    textDecoration: styles.includes("UNDERLINE") ? "underline" : undefined,
  };
}
export const RemoMask = Mark.create({
  name: "remoMask",
  priority: 1100,
  excludes: "",
  parseHTML() { return [{ tag: "span[data-remo-mask]" }]; },
  renderHTML() { return ["span", { "data-remo-mask": "true", class: "masked-text", tabindex: "0", "aria-description": "Masked text. Hover or focus to reveal." }, ["span", { class: "masked-content" }, 0]]; },
  addKeyboardShortcuts() { return { "Mod-Shift-m": () => this.editor.commands.toggleMark(this.name) }; },
});
export function MaskedText({ children }: { children: React.ReactNode }) {
  return <span className="masked-text" data-remo-mask="true" tabIndex={0} aria-description="Masked text. Hover or focus to reveal." onClick={event => { event.stopPropagation(); event.currentTarget.focus(); }}><span className="masked-content">{children}</span></span>;
}
function sliceNode(node: Node, start: number, end: number, stripMask = false): Node {
  return { ...node, text: node.text.slice(start, end), formatting: encode(marks(node.formatting, node.text.length).filter((m: any) => m.end > start && m.start < end && (!stripMask || m.style !== 'MASK')).map((m: any) => ({ ...m, start: Math.max(m.start, start) - start, end: Math.min(m.end, end) - start }))) };
}
export const RemoCode = Mark.create({
  name: "code",
  code: true,
  excludes: "",
  addKeyboardShortcuts() {
    return { "Mod-e": () => this.editor.commands.toggleMark(this.name) };
  },
  parseHTML() {
    return [{ tag: "code" }];
  },
  renderHTML() {
    return ["code", {}, 0];
  },
  addCommands() {
    return {
      toggleCode:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});
export const RemoColor = Mark.create({
  name: "remoColor",
  addAttributes() {
    return { value: { default: "5f6f64" } };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-remo-color]",
        getAttrs: (el) => ({ value: (el as HTMLElement).dataset.remoColor }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-remo-color": HTMLAttributes.value,
        style: `color:#${HTMLAttributes.value}`,
      },
      0,
    ];
  },
});
export const RemoHighlight = Mark.create({
  name: "remoHighlight",
  addAttributes() {
    return { value: { default: "FFE082" } };
  },
  parseHTML() {
    return [
      {
        tag: "mark",
        getAttrs: (el) => ({
          value: (el as HTMLElement).dataset.remoHighlight || "FFE082",
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "mark",
      {
        "data-remo-highlight": HTMLAttributes.value,
        style: `background:#${HTMLAttributes.value};color:#18181b`,
      },
      0,
    ];
  },
});
function tipmark(style: string) {
  const rough=parseRoughStyle(style);if(rough)return {type:'remoRough',attrs:rough};
  if (style === "MASK") return { type: "remoMask" };
  if (style.startsWith("COLOR_"))
    return { type: "remoColor", attrs: { value: style.slice(6) } };
  if (style.startsWith("HIGHLIGHT"))
    return {
      type: "remoHighlight",
      attrs: { value: style.includes("_") ? style.slice(10) : "FFE082" },
    };
  return {
    type:
      { BOLD: "bold", ITALIC: "italic", UNDERLINE: "underline", CODE: "code" }[
        style
      ] || "bold",
  };
}
export function toEditor(node: Node): JSONContent {
  const ms = marks(node.formatting, node.text.length),
    points = [
      ...new Set([
        0,
        node.text.length,
        ...ms.flatMap((m: any) => [m.start, m.end]),
      ]),
    ].sort((a, b) => a - b),
    content: JSONContent[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      styles = ms
        .filter((m: any) => m.start <= a && m.end >= b)
        .map((m: any) => tipmark(m.style)),
      chunks = node.text.slice(a, b).split("\n");
    chunks.forEach((text: string, j: number) => {
      if (j) content.push({ type: "hardBreak", marks: styles });
      if (text) content.push({ type: "text", text, marks: styles });
    });
  }
  return { type: "doc", content: [{ type: "paragraph", content }] };
}
export function fromEditor(json: JSONContent) {
  let text = "";
  const spans: any[] = [];
  function walk(n: JSONContent) {
    if (n.type === "text" || n.type === "hardBreak") {
      const start = text.length;
      text += n.type === "hardBreak" ? "\n" : n.text || "";
      for (const m of n.marks || []) {
        const style =
          m.type === 'remoRough'
            ? roughStyle(m.attrs?.type,m.attrs?.color)
            : m.type === "remoColor"
            ? "COLOR_" + m.attrs?.value
            : m.type === "remoHighlight"
              ? "HIGHLIGHT_" + m.attrs?.value
              : (
                  {
                    bold: "BOLD",
                    italic: "ITALIC",
                    underline: "UNDERLINE",
                    code: "CODE",
                    remoMask: "MASK",
                  } as any
                )[m.type];
        if (style) spans.push({ start, end: text.length, style });
      }
    } else (n.content || []).forEach(walk);
  }
  (json.content || []).forEach((n, i) => {
    if (i) text += "\n";
    walk(n);
  });
  const grouped = new Map<string, any[]>();
  for (const m of spans) {
    const group = grouped.get(m.style) || [],
      last = group.at(-1);
    if (last?.end === m.start) last.end = m.end;
    else group.push({ ...m });
    grouped.set(m.style, group);
  }
  return { text, formatting: encode([...grouped.values()].flat()) };
}
export const RichRead = memo(function RichReadContent({ node, search = "", literal = false, connected = true }: { node: Node; search?: string; literal?: boolean; connected?:boolean }) {
  const visual=useVisualTools();
  if(!literal && /^!\[[^\]]*\]\(https?:\/\/[^\s]+\)$/.test(node.text.trim()))return null;
  if(readTable(node.text))return <NoteTable id={node.id} text={node.text}/>;
  if (node.blockStyle === 'divider') {
    const dividerStyle = node.dividerStyle || 'straight';
    const dividerColor = node.dividerColor || undefined;
    const styleObj = dividerColor ? ({ '--divider-color': dividerColor, color: dividerColor } as React.CSSProperties) : undefined;
    return (
      <div
        className={`note-divider-wrap ${node.text ? 'has-title' : 'is-empty'} style-${dividerStyle}`}
        data-divider-style={dividerStyle}
        style={styleObj}
      >
        <hr className="note-divider note-divider-line" />
        {node.text ? (
          <>
            <span className="note-divider-title">
              <RichRead node={{ ...node, blockStyle: undefined }} search={search} literal={literal} />
            </span>
            <hr className="note-divider note-divider-line" />
          </>
        ) : null}
      </div>
    );
  }
  const semanticUnits=[...(literal?[]:notationParts(node.text)),...noteLinks(node.text),...[...node.text.matchAll(/:[a-z][a-z0-9_-]+:/gi)].map(match=>({start:match.index!,end:match.index!+match[0].length}))];
  const roughRanges=node.codeLanguage?[]:marks(node.formatting,node.text.length).filter((m:any)=>parseRoughStyle(m.style)).map((range:any)=>{
    // Equations, note links and emoji tokens render as complete visual units.
    // A partial source selection decorates that unit without breaking its syntax.
    let start=range.start,end=range.end;for(const unit of semanticUnits)if(start<unit.end&&end>unit.start){start=Math.min(start,unit.start);end=Math.max(end,unit.end);}return {...range,start,end};
  });
  if(roughRanges.length){
    const points=[...new Set<number>([0,node.text.length,...roughRanges.flatMap((m:any)=>[m.start,m.end])])].sort((a,b)=>a-b);
    return <>{points.slice(0,-1).map((start,i)=>{
      const end=points[i+1],fragment=sliceNode(node,start,end);
      fragment.formatting=encode(marks(fragment.formatting,fragment.text.length).filter((m:any)=>!parseRoughStyle(m.style)));
      let content:React.ReactNode=<RichRead node={fragment} search={search} literal={literal} connected={connected}/>;
      for(const range of roughRanges.filter((m:any)=>m.start<=start&&m.end>=end)){const config=parseRoughStyle(range.style)!;content=<RoughAnnotation type={config.type as 'circle'} color={config.color}>{content}</RoughAnnotation>;}
      return <span key={start}>{content}</span>;
    })}</>;
  }
  const maskRanges = marks(node.formatting, node.text.length).filter((m: any) => m.style === 'MASK').sort((a: any, b: any) => a.start - b.start).reduce((ranges: { start: number; end: number }[], mark: any) => {
    const last = ranges.at(-1); if (last && last.end >= mark.start) last.end = Math.max(last.end, mark.end); else ranges.push({ start: mark.start, end: mark.end }); return ranges;
  }, []);
  if (maskRanges.length) {
    let cursor = 0;
    return <>{maskRanges.map((range: { start: number; end: number }) => {
      const start = cursor; cursor = range.end;
      return <span key={range.start}><RichRead node={sliceNode(node, start, range.start, true)} search={search} literal={literal} /><MaskedText><RichRead node={sliceNode(node, range.start, range.end, true)} search={search} literal={literal} /></MaskedText></span>;
    })}<RichRead node={sliceNode(node, cursor, node.text.length, true)} search={search} literal={literal} /></>;
  }
  if (node.codeLanguage) return <CodeRead text={node.text} language={node.codeLanguage} />;
  const notation = literal || node.codeLanguage ? [] : notationParts(node.text);
  if (notation.length) {
    let cursor = 0;
    return <>{notation.map(part => {
      const start = cursor;
      cursor = part.end;
      const fragment = (a: number, b: number) => ({ ...node, text: node.text.slice(a, b), formatting: encode(marks(node.formatting, node.text.length).filter((m: any) => m.end > a && m.start < b).map((m: any) => ({ ...m, start: Math.max(m.start, a) - a, end: Math.min(m.end, b) - a }))) });
      const style = notationFormatting(node, part.start, part.end);
      return <span key={part.start}><RichRead node={fragment(start, part.start)} search={search} literal /><span data-selection-source={node.text.slice(part.start, part.end)}><Notation {...part} style={style} bold={style.fontWeight === 700} />{part.kind==='mermaid'&&visual.diagram&&<button className="edit-note-diagram" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();visual.diagram?.({id:node.id,source:part.source,original:node.text.slice(part.start,part.end),start:part.start,base:node.text});}}><Icon name="diagram" size={13}/>Edit diagram</button>}</span></span>;
    })}<RichRead node={{ ...node, text: node.text.slice(cursor), formatting: encode(marks(node.formatting, node.text.length).filter((m: any) => m.end > cursor).map((m: any) => ({ ...m, start: Math.max(m.start, cursor) - cursor, end: m.end - cursor }))) }} search={search} literal /></>;
  }
  const semanticRanges=connected?[...noteLinks(node.text),...[...node.text.matchAll(/(?:^|(?<=\s))(#[\p{L}\p{N}_-]+)/gu)].map(m=>({start:m.index!,end:m.index!+m[0].length}))].sort((a,b)=>a.start-b.start).filter((r,i,all)=>!all.slice(0,i).some(p=>r.start<p.end)&&!marks(node.formatting,node.text.length).some((m:any)=>m.style==='CODE'&&m.start<r.end&&m.end>r.start)):[];
  if(semanticRanges.length){let at=0;return <>{semanticRanges.map(r=>{const start=at;at=r.end;return <span key={r.start}><RichRead node={sliceNode(node,start,r.start,false)} search={search} literal={literal} connected={false}/><span style={notationFormatting(node,r.start,r.end)}><ConnectedText text={node.text.slice(r.start,r.end)}/></span></span>;})}<RichRead node={sliceNode(node,at,node.text.length,false)} search={search} literal={literal} connected={false}/></>;}
  const matches: { start: number; end: number }[] = [],
    query = search.trim().toLowerCase(),
    text = node.text.toLowerCase();
  if (query) {
    let at = text.indexOf(query);
    while (at >= 0) {
      matches.push({ start: at, end: at + query.length });
      at = text.indexOf(query, at + query.length);
    }
  }
  const ms = marks(node.formatting, node.text.length),
    points = [
      ...new Set([
        0,
        node.text.length,
        ...ms.flatMap((m: any) => [m.start, m.end]),
        ...matches.flatMap(match => [match.start, match.end]),
      ]),
    ].sort((a, b) => a - b);
  return (
    <>
      {points.slice(0, -1).map((a, i) => {
        const b = points[i + 1],
          styles = ms
            .filter((m: any) => m.start <= a && m.end >= b)
            .map((m: any) => m.style);
        const color = styles.find((s: string) => s.startsWith("COLOR_")),
          hl = styles.find((s: string) => s.startsWith("HIGHLIGHT"));
        return (
          <span
            key={a}
            className={matches.some(match => match.start <= a && match.end >= b) ? "search-match" : undefined}
            style={{
              fontWeight: styles.includes("BOLD") ? 650 : undefined,
              fontStyle: styles.includes("ITALIC") ? "italic" : undefined,
              textDecoration: styles.includes("UNDERLINE")
                ? "underline"
                : undefined,
              fontFamily: styles.includes("CODE") ? "monospace" : undefined,
              color: color ? "#" + color.slice(6) : hl ? "#18181b" : undefined,
              background: hl
                ? "#" + (hl.includes("_") ? hl.slice(10) : "FFE082")
                : undefined,
            }}
          >
            {styles.includes('CODE') || node.codeLanguage ? node.text.slice(a, b) : <EmojiText text={node.text.slice(a, b)} />}
          </span>
        );
      })}
    </>
  );
});
export const unsupportedFormatting = (node: Node) =>
  node.formatting
    .split(";")
    .filter(Boolean)
    .some((part: string) => marks(part, node.text.length).length !== 1);
export function BulletEditor(props: Parameters<typeof MountedBulletEditor>[0]) {
  // Divider conversion changes the editable host. Remount the complete editor
  // and its inline pickers together so none retain a detached/destroyed view.
  return <MountedBulletEditor key={`${props.node.id}:${props.node.blockStyle === 'divider' ? 'divider' : 'text'}`} {...props}/>;
}
function MountedBulletEditor({
  node,
  caret,
  initialSelection,
  onChange,
  readCurrentNode,
  onCommand,
  onOutlinePaste,
  onImages,
  onReady,
  disabled,
}: {
  node: Node;
  caret: number | null;
  initialSelection?: { anchor: number; head: number };
  onChange: (id: string, value: { text: string; formatting: string }) => void;
  readCurrentNode?: (id: string) => Node | undefined;
  onCommand: (action: string, id: string, start: number, end: number) => void;
  onOutlinePaste: (id: string, start: number, end: number, text: ClipboardInput) => void;
  onImages?: (id: string, files: File[]) => void;
  onReady: (editor: Editor | null) => void;
  disabled: boolean;
}) {
  const emojiLibrary=useEmojiLibrary(),emojiLibraryRef=useRef(emojiLibrary);emojiLibraryRef.current=emojiLibrary;
  const isDivider = node.blockStyle === 'divider';
  const host = useRef<HTMLDivElement>(null),
    editor = useRef<Editor | null>(null),
    callbacks = useRef({ onChange, onCommand, onOutlinePaste, onImages, onReady, node });
  callbacks.current = { onChange, onCommand, onOutlinePaste, onImages, onReady, node };
  const serialized=useRef<{doc:Editor['state']['doc'];value:ReturnType<typeof fromEditor>}|null>(null);
  const content=(current:Editor)=>{if(serialized.current?.doc===current.state.doc)return serialized.current.value;const value=fromEditor(current.getJSON());serialized.current={doc:current.state.doc,value};return value;};
  const connectionKeys = useRef<((event:KeyboardEvent)=>boolean)|null>(null);
  const [emojiEditor, setEmojiEditor] = useState<Editor | null>(null), slashKeys = useRef<((event: KeyboardEvent) => boolean) | null>(null), emojiKeys = useRef<((event: KeyboardEvent) => boolean) | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const e = new Editor({
      element: host.current,
      extensions: [
        StarterKit.configure({
          heading: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          listKeymap: false,
          codeBlock: false,
          code: false,
          horizontalRule: false,
          strike: false,
          link: false,
          undoRedo: false,
        }),
        editorEmoji(()=>emojiLibraryRef.current,()=>callbacks.current.node.codeLanguage),
        codeHighlight(() => callbacks.current.node.codeLanguage),
        tagHighlight(() => callbacks.current.node.codeLanguage),
        RemoCode,
        RemoMask,
        RemoColor,
        RemoHighlight,
        RemoRough,
      ],
      content: toEditor(node),
      editorProps: {
        attributes: {
          "aria-label": "Edit bullet",
          role: "textbox",
          "aria-multiline": "true",
        },
        handleKeyDown: (_view, event) => {
          if (event.isComposing) return false;
          if (connectionKeys.current?.(event)) { event.preventDefault();event.stopPropagation();return true; }
          if (slashKeys.current?.(event)) { event.preventDefault(); event.stopPropagation(); return true; }
          if (emojiKeys.current?.(event)) { event.preventDefault(); event.stopPropagation(); return true; }
          const { from, to } = e.state.selection,
            start = from - 1,
            end = to - 1;
          let command: string | null = null;
          const modifier = event.ctrlKey || event.metaKey;
          if (modifier && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'm') {
            event.preventDefault(); e.commands.toggleMark('remoMask'); return true;
          }
          if (modifier && event.altKey && event.key.toLowerCase() === "c") command = "block:code";
          else if (modifier && event.altKey && event.key.toLowerCase() === "m") command = "block:mcq";
          else if (modifier && event.altKey && event.key.toLowerCase() === "t") command = "block:task";
          else if (modifier && event.altKey && (event.code === "Digit0" || event.key === "0")) command = "block:paragraph";
          else if (modifier && event.altKey && /^[1-3]$/.test(event.key)) command = "block:h" + event.key;
          else if (modifier && event.shiftKey && (event.code === "Digit7" || event.key === "7")) command = "block:numbered";
          else if (modifier && event.shiftKey && (event.code === "Digit8" || event.key === "8")) command = "block:bulleted";
          else if (modifier && event.key === "Enter" && callbacks.current.node.codeLanguage) command = "exitCode";
          else if (modifier && event.key === "Enter") command = "complete";
          else if (modifier && (event.key === " " || event.key === "Spacebar"))
            command = "toggleCollapse";
          else if (modifier && event.shiftKey && event.key === "ArrowUp")
            command = "moveUp";
          else if (modifier && event.shiftKey && event.key === "ArrowDown")
            command = "moveDown";
          else if (event.altKey && event.key === "ArrowRight") command = "zoomIn";
          else if (event.altKey && event.key === "ArrowLeft") command = "zoomOut";
          else if (event.key === "ArrowUp" && from === 1 && from === to)
            command = "previous";
          else if (
            event.key === "ArrowDown" &&
            start === callbacks.current.node.text.length &&
            from === to
          )
            command = "next";
          else if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !callbacks.current.node.codeLanguage &&
            !callbacks.current.node.text.startsWith("```mermaid") &&
            !callbacks.current.node.text.startsWith("$$")
          )
            command = "enter";
          else if (callbacks.current.node.codeLanguage && event.key === "Enter") {
            event.preventDefault(); e.commands.setHardBreak(); return true;
          }
          else if (callbacks.current.node.codeLanguage && event.key === "Tab" && !modifier && !event.altKey) {
            event.preventDefault(); e.commands.insertContent('  '); return true;
          }
          else if (event.key === "Tab")
            command = event.shiftKey ? "outdent" : "indent";
          else if (
            event.key === "Backspace" &&
            callbacks.current.node.blockStyle === "divider" &&
            !e.state.doc.textContent.trim()
          ) {
            command = "deleteDivider";
          }
          else if (event.key === "Backspace" && from === 1 && from === to)
            command = "merge";
          else if (event.key === "Escape") command = "stop";
          else if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "z"
          )
            command = event.shiftKey ? "redo" : "undo";
          if (command) {
            event.preventDefault();
            callbacks.current.onCommand(command, node.id, start, end);
            return true;
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith("image/"));
          if (files.length && callbacks.current.onImages) {
            event.preventDefault();
            callbacks.current.onImages(node.id, files);
            return true;
          }
          if (callbacks.current.node.codeLanguage) return false;
          const text = event.clipboardData?.getData("text/plain") || "", html = event.clipboardData?.getData("text/html") || "";
          const opml = event.clipboardData?.getData("text/x-opml") || event.clipboardData?.getData("application/xml") || "";
          if (!text && !html && !opml) return false;
          // Keep equation/diagram source in a single bullet using the editor's literal paste path.
          if (/^(?:```mermaid|\$\$|\\\[)/.test(text) && !html && !opml) return false;
          const { from, to } = e.state.selection;
          event.preventDefault();
          callbacks.current.onOutlinePaste(node.id, from - 1, to - 1, { text, html, opml });
          return true;
        },
        transformPasted: (slice) => {
          const parts: any[] = [];
          let offset = 0;
          slice.content.forEach((block) => {
            if (offset++ > 0) parts.push(e.schema.nodes.hardBreak.create());
            if (block.isText || block.type.name === "hardBreak")
              parts.push(block);
            else
              block.descendants((child) => {
                if (child.isText || child.type.name === "hardBreak")
                  parts.push(child);
              });
          });
          return new Slice(Fragment.fromArray(parts), 0, 0);
        },
      },
      onUpdate: ({ editor }) =>
        callbacks.current.onChange(node.id, content(editor)),
      onSelectionUpdate: ({ editor: current }) => callbacks.current.onReady(current),
    });
    editor.current = e;
    setEmojiEditor(e);
    onReady(e);
    e.commands.focus();
    if (initialSelection) {
      const clamp = (offset: number) => Math.min(node.text.length + 1, Math.max(1, offset + 1));
      e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, clamp(initialSelection.anchor), clamp(initialSelection.head))));
    } else if (caret !== null)
      e.commands.setTextSelection(
        Math.min(node.text.length + 1, Math.max(1, caret + 1)),
      );
    return () => {
      onReady(null);
      e.destroy();
      editor.current = null;
      emojiKeys.current = null;
    };
  }, [node.id]);
  useEffect(() => {
    const e = editor.current;
    if (!e) return;
    // A concurrent outline render may echo an earlier keystroke after the
    // editor has accepted newer input. Reconcile against the authoritative
    // document, which is published synchronously before React renders it.
    const incoming = readCurrentNode?.(node.id) || node;
    const current = content(e);
    if (current.text !== incoming.text || current.formatting !== incoming.formatting) {
      const pos = e.state.selection.from;
      e.commands.setContent(toEditor(incoming), { emitUpdate: false });
      e.commands.setTextSelection(Math.min(pos, incoming.text.length + 1));
    }
    const editable = !disabled && !unsupportedFormatting(incoming);
    if (e.isEditable !== editable) e.setEditable(editable, false);
  }, [node.text, node.formatting, disabled]);
  // Refresh decorations only when their inputs change. Dispatching an empty
  // transaction for every local text echo can restore an older DOM selection
  // while the browser is still processing native typing.
  useEffect(() => {
    const e = editor.current;
    if (e && !e.isDestroyed) e.view.dispatch(e.state.tr);
  }, [node.codeLanguage, emojiLibrary]);
  return (
    <>
      {node.codeLanguage && <div className="code-toolbar"><label>Language <select aria-label="Code language" value={codeLanguages.includes(node.codeLanguage) ? node.codeLanguage : 'plaintext'} disabled={disabled} onChange={event => onCommand('language:' + event.target.value, node.id, 0, 0)}>{codeLanguages.map(language => <option key={language} value={language}>{language === 'plaintext' ? 'Plain text' : language}</option>)}</select></label><small>Enter: new line · Tab: indent · Ctrl/⌘ Enter: next bullet</small></div>}
      {isDivider ? (
        <div
          key="divider-editor"
          className="note-divider-wrap is-editing"
          data-divider-style={node.dividerStyle || 'straight'}
          style={node.dividerColor ? ({ '--divider-color': node.dividerColor, color: node.dividerColor } as React.CSSProperties) : undefined}
        >
          <hr className="note-divider note-divider-line" />
          <div className="note-divider-title-editor">
            <div ref={host} className="bullet-editor note-divider-editor" />
          </div>
          <hr className="note-divider note-divider-line" />
        </div>
      ) : (
        <div key="text-editor" ref={host} className="bullet-editor" />
      )}
      {emojiEditor && <SlashMenu editor={emojiEditor} enabled={!disabled && !node.codeLanguage && !unsupportedFormatting(node)} keyHandler={slashKeys} onChoose={id => onCommand((['link','mirror','backlinks'].includes(id)?'relation:':['pane','date','image','complete','countdown','table','gallery','music','divider','diagram','drawing'].includes(id)?'action:':'block:') + id, node.id, emojiEditor.state.selection.from-1, emojiEditor.state.selection.to-1)} />}
      {emojiEditor && <InlineConnections editor={emojiEditor} nodeId={node.id} enabled={!disabled&&!node.codeLanguage&&!unsupportedFormatting(node)} keyHandler={connectionKeys}/>}
      {emojiEditor && <InlineEmojiPicker editor={emojiEditor} nodeId={node.id} enabled={!disabled && !node.codeLanguage && !unsupportedFormatting(node) && !/^(?:```|\$\$|\\\[)/.test(node.text)} keyHandler={emojiKeys} />}
      {!node.codeLanguage && notationParts(node.text).length > 0 && <div className="notation-preview"><small>Preview · edit source above</small><RichRead node={node} /></div>}
      {unsupportedFormatting(node) && (
        <span className="unsupported-format">
          This bullet contains unsupported formatting. Editing is paused to
          preserve it.
        </span>
      )}
    </>
  );
}

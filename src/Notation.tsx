import {mountDiagram, type DiagramState} from './diagram-renderer';
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

export function notationParts(text: string) {
  const pattern = /```mermaid\s*\n([\s\S]*?)```|\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|(?<![\\\w])\$([^$\n]+?)\$(?!\w)/g;
  const parts: { start: number; end: number; source: string; kind: "math" | "mermaid"; display: boolean }[] = [];
  for (const m of text.matchAll(pattern)) parts.push({ start: m.index!, end: m.index! + m[0].length,
    source: m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5], kind: m[1] !== undefined ? "mermaid" : "math",
    display: m[1] !== undefined || m[2] !== undefined || m[3] !== undefined });
  return parts;
}

export function Notation({ source, kind, display, style, bold = false }: { source: string; kind: "math" | "mermaid"; display: boolean; style?: CSSProperties; bold?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const host = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<DiagramState & {html?:string}>({});
  useEffect(() => {
    if (kind === "mermaid" && host.current) return mountDiagram(host.current, source, `remoDiagram${id}`, setResult);
    let cancelled = false;
    setResult({});
    void (async () => {
      try {
        let html: string;
        if (kind === "math") {
          const { default: katex } = await import("katex");
          html = katex.renderToString(bold ? `\\boldsymbol{${source}}` : source, { displayMode: display, throwOnError: true, trust: false, maxSize: 20, maxExpand: 1000 });
        } else return;
        if (!cancelled) setResult({ html });
      } catch {
        if (!cancelled) setResult({ error: `Invalid ${kind === "math" ? "LaTeX" : "Mermaid"} — edit the source to correct it.` });
      }
    })();
    return () => { cancelled = true; };
  }, [source, kind, display, id, bold]);
  return <span className={`notation ${display ? "notation-block" : ""}`} style={style}>
    {kind === "mermaid" && <span ref={host} className="diagram-canvas" role="img" aria-label={source} aria-busy={!result.ready && !result.error}/> }
    {result.ready ? null : result.html ? <span role="img" aria-label={source} dangerouslySetInnerHTML={{ __html: result.html }} /> :
      <span className="notation-source"><code>{source}</code>{result.error && <small role="status">{result.error}</small>}</span>}
  </span>;
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { Workspace } from "./data";
import { bulkMcqPlan } from "./mcq.mjs";
import { Icon } from "./icons";

export function BulkMCQEditor({ doc, id, onClose, onSave }: { doc: Workspace; id: string; onClose: () => void; onSave: () => void }) {
  const plan = useMemo(() => bulkMcqPlan(doc, id), [doc, id]), ref = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0), items = [...plan.ready.map((item: any) => ({ ...item, reason: item.existing ? "Update existing MCQ" : "Ready to convert" })), ...plan.skipped], pageSize = 40;
  useEffect(() => { const el = ref.current; if (el?.showModal) el.showModal(); else el?.setAttribute("open", ""); return () => el?.close?.(); }, []);
  return <dialog ref={ref} className="mcq-editor" aria-labelledby="bulk-mcq-title" onCancel={onClose}>
    <div className="dialog-head"><h2 id="bulk-mcq-title">Build an MCQ deck in bulk</h2><button className="icon-button" aria-label="Close bulk MCQ editor" onClick={onClose}><Icon name="close" size={18} /></button></div>
    <p className="mcq-helper">Each question needs four direct child options. Add <code>@Answer</code> to the correct option. All nested branches are included, even when collapsed. Markers are hidden during study; your notes stay unchanged.</p>
    <a className="feature-guide-inline" href="/guides/mcqs#bulk" target="_blank" rel="noopener noreferrer">Bulk conversion walkthrough ↗</a>
    <p className="bulk-mcq-summary" role="status"><strong>{plan.ready.length} ready</strong><span>{plan.skipped.length} skipped · no answer will be guessed</span></p>
    <ul className="bulk-mcq-list">{items.slice(page * pageSize, (page + 1) * pageSize).map(item => <li key={item.id}><span>{item.text || "Untitled question"}</span><small>{item.reason}</small></li>)}</ul>
    {!items.length && <p>No four-option questions found. Add questions under this branch, with four child bullets each.</p>}
    {items.length > pageSize && <div className="bulk-mcq-pages"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(items.length / pageSize)}</span><button disabled={(page + 1) * pageSize >= items.length} onClick={() => setPage(page + 1)}>Next</button></div>}
    <div className="mcq-editor-footer"><button onClick={onClose}>Cancel</button><button className="study-primary" disabled={!plan.ready.length} onClick={onSave}>Convert {plan.ready.length} {plan.ready.length === 1 ? "question" : "questions"}</button></div>
  </dialog>;
}

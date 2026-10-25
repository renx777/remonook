import { useEffect, useRef, useState } from "react";
import type { Node, Workspace } from "./data";
import { index } from "./domain.mjs";
import { RichRead } from "./editor";
import { Icon } from "./icons";
import { mcqDefinition, taggedMcqAnswer, mcqStudyOption } from "./mcq.mjs";

export function MCQEditor({ doc, id, onClose, onSave }: { doc: Workspace; id: string; onClose: () => void; onSave: (value: { correctOptionId: string; explanation: string; shuffle: boolean; notebook: boolean }) => void }) {
  const idx = index(doc.tables.bullets), node = idx.byId.get(id), options = (idx.children.get(id) || []) as Node[], config = mcqDefinition(doc, id, idx)?.config;
  const ref = useRef<HTMLDialogElement>(null);
  const [answer, setAnswer] = useState(taggedMcqAnswer(options).id || config?.correctOptionId || ""), [explanation, setExplanation] = useState(config?.explanation || ""), [shuffle, setShuffle] = useState(config?.shuffle !== false), [notebook, setNotebook] = useState(false);
  useEffect(() => { const dialog = ref.current; if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute("open", ""); return () => { if (dialog?.close) dialog.close(); }; }, []);
  const eligible = !!node?.text.trim() && options.length === 4 && options.every(option => mcqStudyOption(option).text.trim());
  return <dialog ref={ref} className="mcq-editor" aria-labelledby="mcq-editor-title" onCancel={onClose}>
    <div className="dialog-head"><h2 id="mcq-editor-title">{config ? "Edit multiple choice" : "Turn into multiple choice"}</h2><button className="icon-button" aria-label="Close MCQ editor" onClick={onClose}><Icon name="close" size={18} /></button></div>
    <p className="mcq-editor-prompt">{node?.text}</p>
    {!eligible ? <p role="alert">Use this bullet as the question and add exactly four non-empty direct children as its options.</p> : <>
      <p className="mcq-helper">Choose the correct answer. Option order can be shuffled during study.</p>
      {taggedMcqAnswer(options).count === 1 && <p className="mcq-helper">The option marked @Answer has been selected automatically. The marker stays hidden during study.</p>}
      {taggedMcqAnswer(options).count > 1 && <p className="mcq-helper" role="alert">Several options have @Answer. Choose the correct answer here, or fix the markers before bulk conversion.</p>}
      <fieldset className="mcq-answer-picker"><legend>Correct answer</legend>{options.map((option: Node, i: number) => <label key={option.id} className={answer === option.id ? "is-correct" : ""}><input type="radio" name="mcq-correct" value={option.id} checked={answer === option.id} onChange={() => setAnswer(option.id)} /><span className="mcq-letter">{"ABCD"[i]}</span><span><RichRead node={option} /></span></label>)}</fieldset>
      <label className="mcq-explanation-label">Why is it correct? <span>Optional</span><textarea aria-label="Answer explanation" value={explanation} maxLength={10000} placeholder="Add a short explanation to reinforce the answer…" onChange={event => setExplanation(event.target.value)} /></label>
      <label className="mcq-setting"><input type="checkbox" checked={shuffle} onChange={event => setShuffle(event.target.checked)} />Shuffle options while studying</label>
      <label className="mcq-setting"><input type="checkbox" checked={notebook} onChange={event => setNotebook(event.target.checked)} />Create an MCQ notebook for this question</label>
    </>}
    <div className="mcq-editor-footer"><button onClick={onClose}>Cancel</button><button className="study-primary" disabled={!eligible || !options.some(option => option.id === answer)} onClick={() => onSave({ correctOptionId: answer, explanation, shuffle, notebook })}>Save MCQ</button></div>
  </dialog>;
}

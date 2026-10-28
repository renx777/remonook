import type { Node, Workspace } from "./data";
import { RichRead } from "./editor";
import { MediaContent } from "./MediaContent";
import { mcqStudyOption } from "./mcq.mjs";
import { useRef } from "react";
import { useEntranceMotion } from "./useEntranceMotion";

export function MCQCard({ definition, options, attempt, doc, assets, disabled, onChoose }: { definition: any; options: Node[]; attempt: any; doc: Workspace; assets: Map<string, Blob>; disabled: boolean; onChoose: (id: string, option: HTMLButtonElement) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEntranceMotion(ref, attempt?.answeredAt, { selector: ".mcq-feedback", kind: "reveal", active: !!attempt });
  return <div ref={ref} className="mcq-card">
    <div className="mcq-options" role="group" aria-label="Choose one answer">{options.map((original, i) => {
      const option = mcqStudyOption(original);
      const chosen = attempt?.choiceId === option.id, right = attempt && option.id === definition.config.correctOptionId;
      return <button key={option.id} className={`mcq-option ${right ? "is-correct" : chosen ? "is-wrong" : ""}`} aria-label={`Option ${"ABCD"[i]}: ${option.text}`} disabled={disabled || !!attempt} onClick={event => onChoose(option.id, event.currentTarget)}>
        <span className="mcq-letter">{"ABCD"[i]}</span><span className="mcq-option-content"><RichRead node={option} /><MediaContent nodeId={option.id} text={option.text} media={doc.tables.media} assets={assets} /></span><span className="mcq-option-result" aria-hidden="true">{right ? "✓" : chosen ? "×" : ""}</span>
      </button>;
    })}</div>
    {attempt && <div className="mcq-feedback" role="status" aria-live="polite">
      <strong>{attempt.correct ? "Correct!" : "Not quite — review the correct answer below."}</strong>
      {!attempt.correct && <p className="mcq-correct-answer"><strong>Correct answer: </strong>{mcqStudyOption(definition.options.find((option: Node) => option.id === definition.config.correctOptionId)).text}</p>}
      {definition.config.explanation && <div className="mcq-explanation"><strong>Why this answer</strong><p>{definition.config.explanation}</p></div>}
      <small>First answer recorded. {attempt.correct ? "Nice recall." : "You can practice missed questions after the session."}</small>
    </div>}
  </div>;
}

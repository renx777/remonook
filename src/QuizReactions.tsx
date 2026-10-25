import { useEffect, useRef, useState } from "react";
import type { Workspace } from "./data";
import { useCoverImage } from "./DeckCover";
import { Icon } from "./icons";

const defaults = {
  correct: [
    { path: new URL("./assets/reactions/victory-wiggle.gif", import.meta.url).href, label: "Victory wiggle" },
    { path: new URL("./assets/reactions/tiny-trophy.gif", import.meta.url).href, label: "Tiny trophy, enormous brain" },
  ],
  wrong: [
    { path: new URL("./assets/reactions/brain-buffering.gif", import.meta.url).href, label: "Brain.exe is buffering" },
    { path: new URL("./assets/reactions/plot-twist.gif", import.meta.url).href, label: "Well, that was a plot twist" },
  ],
};
export type ReactionSettings = { enabled: boolean; tone: "playful" | "gentle"; correct: { path: string; label: string }[]; wrong: { path: string; label: string }[] };
export function reactionSettings(doc: Workspace): ReactionSettings {
  const saved = doc.web.quizReactions || {};
  const group = (value: unknown) => Array.isArray(value) ? value.filter(item => item && typeof item.path === "string" && /^media\/quiz-[a-zA-Z0-9._-]+\.gif$/.test(item.path)).slice(0, 6).map(item => ({ path: item.path as string, label: typeof item.label === "string" ? item.label.slice(0, 100) : "Custom GIF" })) : [];
  return { enabled: true, tone: saved.tone === "gentle" ? "gentle" : "playful", correct: group(saved.correct), wrong: group(saved.wrong) };
}
export function QuizFeedback({ correct, seed, doc, assets }: { correct: boolean; seed: number; doc: Workspace; assets: Map<string, Blob> }) {
  const settings = reactionSettings(doc), kind = correct ? "correct" : "wrong", custom = settings[kind];
  const reaction = (custom.length ? custom : defaults[kind])[Math.abs(seed) % (custom.length || defaults[kind].length)];
  const fallback = defaults[kind][Math.abs(seed) % defaults[kind].length];
  const url = useCoverImage(assets.get(reaction.path));
  const [failed, setFailed] = useState(false), [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(false); setFailed(false); }, [seed, reaction.path]);
  const show = !hidden;
  const imageSrc = failed || (custom.length > 0 && !assets.has(reaction.path)) ? fallback.path : custom.length ? url : reaction.path;
  return <div className={`quiz-reaction ${correct ? "is-correct" : "is-wrong"}`}>
    {show && imageSrc ? <img src={imageSrc} alt={failed ? fallback.label : reaction.label} onError={() => { if (failed || imageSrc === fallback.path) setHidden(true); else setFailed(true); }} /> : <span className="quiz-reaction-static" aria-hidden="true">{correct ? "✦" : "↻"}</span>}
    <div><strong>{correct ? "Correct!" : "Not quite!"}</strong><p>{settings.tone === "gentle" ? (correct ? "Nice recall. Keep it going." : "A useful mistake. Read the explanation and try it again later.") : correct ? "Big brain energy. Nicely done!" : "Plot twist! Your comeback starts with the right answer."}</p>
      {!show && <small>Reaction hidden.</small>}
    </div>
    {show && <button className="study-text-button" onClick={() => setHidden(true)} aria-label="Hide reaction animation">Hide GIF</button>}
  </div>;
}
function ReactionPreview({ item, assets }: { item: { path: string; label: string }; assets: Map<string, Blob> }) {
  const url = useCoverImage(assets.get(item.path));
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (!playing) return; const timer = setTimeout(() => setPlaying(false), 4000); return () => clearTimeout(timer); }, [playing]);
  return playing ? <button className="quiz-preview-playing" onClick={() => setPlaying(false)} aria-label={`Stop ${item.label}`}><img src={url || item.path} alt={item.label} /></button> : <button className="quiz-preview-play" onClick={() => setPlaying(true)} aria-label={`Preview ${item.label}`}><span aria-hidden="true">▷</span>Preview GIF</button>;
}
export function QuizReactionSettings({ doc, assets, onClose, onSave }: { doc: Workspace; assets: Map<string, Blob>; onClose: () => void; onSave: (settings: ReactionSettings, files: { correct: File[]; wrong: File[] }) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null), settings = reactionSettings(doc);
  const [draft, setDraft] = useState(settings), [files, setFiles] = useState<{ correct: File[]; wrong: File[] }>({ correct: [], wrong: [] }), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { const dialog = ref.current; if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute("open", ""); return () => { if (dialog?.close) dialog.close(); }; }, []);
  return <dialog ref={ref} className="quiz-settings" aria-labelledby="quiz-settings-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-head"><h2 id="quiz-settings-title">Quiz reactions</h2><button className="icon-button" aria-label="Close quiz reactions" disabled={busy} onClick={onClose}><Icon name="close" size={18} /></button></div>
    <p className="mcq-helper">A little celebration. A little comic relief. Your GIFs stay on this device and travel in full backups.</p>
    <label className="mcq-explanation-label">Feedback style<select aria-label="Quiz feedback style" value={draft.tone} disabled={busy} onChange={event => setDraft({ ...draft, tone: event.target.value as "playful" | "gentle" })}><option value="playful">Playful · lighthearted teasing</option><option value="gentle">Gentle · encouragement only</option></select></label>
    {(["correct", "wrong"] as const).map(kind => <fieldset className="quiz-gif-group" disabled={busy} key={kind}><legend>{kind === "correct" ? "Correct answer · celebrate" : "Wrong answer · comic relief"}</legend>
      <div className="quiz-gif-previews">{(draft[kind].length ? draft[kind] : defaults[kind]).map(item => <div key={item.path}><ReactionPreview item={item} assets={assets} /><small>{item.label}</small></div>)}</div>
      <label className="quiz-gif-upload">Add your GIF set<input type="file" accept="image/gif,.gif" multiple onChange={event => { const selected = [...(event.target.files || [])]; if (selected.length > 6) { setError("Choose up to six GIFs for each outcome."); return; } setError(""); setFiles({ ...files, [kind]: selected }); }} /><small>{files[kind].length ? `${files[kind].length} GIFs ready to save` : "Up to 6 GIFs · 2 MB each · replaces this outcome’s custom set"}</small></label>
      {(draft[kind].length > 0 || files[kind].length > 0) && <button className="study-text-button" onClick={() => { setDraft({ ...draft, [kind]: [] }); setFiles({ ...files, [kind]: [] }); }}>Use built-in GIFs</button>}
    </fieldset>)}
    <p className="mcq-helper">Answer GIFs always play automatically, including with reduced motion enabled. They stay visible until you continue or hide them.</p>
    {error && <p role="alert" className="cover-error">{error}</p>}
    <div className="mcq-editor-footer"><button disabled={busy} onClick={onClose}>Cancel</button><button className="study-primary" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(draft, files); onClose(); } catch (error) { setError(error instanceof Error ? error.message : "Could not save GIFs."); setBusy(false); } }}>{busy ? "Saving…" : "Save reactions"}</button></div>
  </dialog>;
}

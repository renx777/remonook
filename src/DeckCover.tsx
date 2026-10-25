import { useEffect, useRef, useState, type CSSProperties } from "react";
import { coverIcons, coverPresets, type DeckDesign } from "./deck-designs";
import { Icon } from "./icons";

export function useCoverImage(blob?: Blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== "function") { setUrl(""); return; }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
export function DeckArtwork({ title, design, image, small = false }: { title: string; design: DeckDesign; image?: Blob; small?: boolean }) {
  const url = useCoverImage(image);
  const preset = coverPresets.find(preset => preset.id === design.preset) || coverPresets[0];
  return <div className={`deck-artwork cover-pattern-${design.pattern} ${url ? "has-cover-image" : ""} ${small ? "is-small" : ""}`} style={{ "--cover-color": preset.color, "--cover-accent": preset.accent } as CSSProperties}>
    {url && <img className="deck-cover-image" src={url} alt="" style={{ objectPosition: `50% ${design.position}%` }} />}
    <div className="cover-shade" /><span className="notebook-spine" aria-hidden="true" />
    <div className="cover-lettering"><span className="cover-emblem" aria-hidden="true">{design.icon}</span><span className="cover-overline">REMO · STUDY NOTEBOOK</span><strong>{title}</strong><span className="cover-rule" /></div>
  </div>;
}

export function CoverDesigner({ title, design, assets, desk = false, onSave, onClose }: { title: string; design: DeckDesign; assets: Map<string, Blob>; desk?: boolean; onSave: (design: DeckDesign, file?: File) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(design), [file, setFile] = useState<File>(), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const image = file || assets.get(draft.image);
  useEffect(() => {
    const element = dialog.current;
    if (typeof element?.showModal === "function") element.showModal(); else element?.setAttribute("open", "");
    return () => { if (typeof element?.close === "function") element.close(); else element?.removeAttribute("open"); };
  }, []);
  const update = (value: Partial<DeckDesign>) => setDraft(current => ({ ...current, ...value }));
  return <dialog ref={dialog} className="cover-designer" aria-labelledby="cover-designer-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }} onClick={event => { if (event.target === dialog.current && !saving) onClose(); }}>
    <div className="cover-designer-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h2 id="cover-designer-title">{desk ? "Your study space" : "Design your notebook"}</h2><p>{title}</p></div><button className="icon-button" aria-label="Close cover designer" disabled={saving} onClick={onClose}><Icon name="close" size={18} /></button></div>
    <div className="cover-designer-body"><div className="cover-live-preview"><DeckArtwork title={title} design={draft} image={image} /><small>Full cover · no cropping · live preview</small></div>
      <div className="cover-options"><fieldset disabled={saving}><legend>Cover collection</legend><div className="cover-presets">{coverPresets.map(preset => <button key={preset.id} aria-label={`${preset.name} cover`} aria-pressed={draft.preset === preset.id} title={preset.name} style={{ backgroundColor: preset.color }} onClick={() => update({ preset: preset.id })}>{draft.preset === preset.id ? "✓" : ""}</button>)}</div></fieldset>
      <fieldset disabled={saving}><legend>Paper texture</legend><div className="cover-textures">{["plain", "ruled", "grid", "dots"].map(pattern => <button key={pattern} aria-pressed={draft.pattern === pattern} onClick={() => update({ pattern })}>{pattern[0].toUpperCase() + pattern.slice(1)}</button>)}</div></fieldset>
      {!desk && <fieldset disabled={saving}><legend>Notebook symbol</legend><div className="cover-symbols">{coverIcons.map(icon => <button key={icon} aria-label={`Cover symbol ${icon}`} aria-pressed={draft.icon === icon} onClick={() => update({ icon })}>{icon}</button>)}</div></fieldset>}
      <fieldset disabled={saving}><legend>Your own image</legend><div className="cover-image-actions"><button onClick={() => input.current?.click()}><Icon name="image" size={15} />{image ? "Replace image" : "Upload image"}</button>{image && <button onClick={() => { setFile(undefined); update({ image: "" }); }}>Remove</button>}</div><input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/avif" hidden onChange={event => { const next = event.target.files?.[0]; event.target.value = ""; if (!next) return; if (next.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp", "image/avif"].includes(next.type)) { setError("Choose a JPG, PNG, WebP or AVIF image under 2 MB."); return; } setError(""); setFile(next); }} />
      {image && <label className="cover-position">Image position<input type="range" min="0" max="100" value={draft.position} onChange={event => update({ position: Number(event.target.value) })} /></label>}<small>JPG, PNG, WebP or AVIF · up to 2 MB</small></fieldset>
      <label className="cover-background-toggle"><input type="checkbox" checked={draft.backdrop} disabled={saving} onChange={event => update({ backdrop: event.target.checked })} /><span>{desk ? "Use as Study Desk background" : "Use cover as study background"}<small>A soft backdrop; flashcards stay easy to read.</small></span></label>
      </div></div>
    {error && <p className="cover-error" role="alert">{error}</p>}
    <div className="cover-designer-footer"><button disabled={saving} onClick={onClose}>Cancel</button><button className="study-primary" disabled={saving} onClick={async () => { setSaving(true); setError(""); try { await onSave(draft, file); onClose(); } catch (error) { setError(error instanceof Error ? error.message : "Could not save this cover."); setSaving(false); } }}>{saving ? "Saving…" : "Apply design"}</button></div>
  </dialog>;
}

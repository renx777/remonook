import React, {useState,useEffect} from "react";
import {accountLocalKey} from "./data";
import {widgetAppearance,palettes,type WidgetAppearance} from "./widget-appearance";
import "./widget-appearance.css";
import { isApp } from "./desktop";
export function NativeStudyWidgetSettings({
  widget,
}: {
  widget: {
    enabled: boolean;
    pending: number;
    error: string;
    desktop: boolean;
    setEnabled: (on: boolean) => Promise<void>;
    open: () => unknown;
    refresh: () => void;
  };
}) {
  const [appearance,setAppearance]=useState(widgetAppearance);
  const androidApi=Number(navigator.userAgent.match(/RemoAndroidAPI\/(\d+)/)?.[1]||0);
  const androidVersion=Number(navigator.userAgent.match(/Android (\d+)/)?.[1]||0);
  const change=(next:WidgetAppearance)=>{
    localStorage.setItem(accountLocalKey('remo-widget-appearance'),JSON.stringify(next));
    setAppearance(next);widget.refresh();
  };
  const [theme,setTheme]=useState<'light'|'dark'>(()=>matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  useEffect(()=>{const query=matchMedia('(prefers-color-scheme: dark)');const change=()=>setTheme(query.matches?'dark':'light');query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
  const tokens=palettes.palettes[appearance.palette][theme];
  if (!isApp()) return null;
  return (
    <section
      className="native-widget-settings"
      aria-label="Study outside the app"
    >
      <h3>Study outside the main window</h3>
      <p>
        Review due text flashcards in a compact desktop study window or an
        Android home-screen widgets for Study, Today, Focus, Capture, Study rhythm and Resurface. MCQs, images and unsupported rich content
        stay in Study Desk.
      </p>
      <label className="native-widget-enable">
        <input
          type="checkbox"
          checked={widget.enabled}
          onChange={(event) => void widget.setEnabled(event.target.checked)}
        />
        Enable widgets for this workspace on this device
      </label>
      <p className="dialog-muted">
        This caches widget note text, reminders, timer status and study counts in private app storage on this
        device. Turn it off to clear the visible card cache. Pending reviews
        remain safely associated with their original workspace.
      </p>
      {widget.enabled && (
        <>
          {widget.desktop ? (
            <button onClick={() => void widget.open()}>
              Open study window
            </button>
          ) : (
            <p>
              On your Android home screen, open{" "}
              <strong>Widgets → RemoNook</strong>, then
              choose Study, Today, Focus, Quick capture, Study rhythm or Resurface. Each widget can follow the app colours or have its own palette.
            </p>
          )}
          <button onClick={widget.refresh}>Refresh widget cache</button>
          <p role="status">
            {widget.pending
              ? `${widget.pending} action${widget.pending === 1 ? "" : "s"} saved on this device · pending app processing`
              : "Reviews use normal saving and synchronization after the app processes them."}
          </p>
        </>
      )}
      <section className="widget-colours">
        <h3>Widget colours</h3>
        <p>Used by every RemoNook widget on this device unless a widget picks its own.</p>
        <fieldset><legend className="widget-sr">Widget colours</legend><div className="widget-palette-grid">
          {Object.entries(palettes.palettes).map(([id,palette])=><label key={id} className={appearance.palette===id?'chosen':''}>
            <span className="widget-swatches" aria-hidden="true">{['hero','accent','surfaceAlt'].map(role=><i key={role} style={{background:palette[theme][role as keyof typeof tokens]}}/>)}</span>
            <span><input type="radio" name="widget-palette" value={id} checked={appearance.palette===id} onChange={()=>change({...appearance,palette:id as WidgetAppearance['palette']})}/>{palette.name}{id==='marigold'&&<small>Default</small>}</span>
          </label>)}
        </div></fieldset>
        {(androidApi>=31||androidVersion>=12)&&<label className="widget-wallpaper"><input type="checkbox" checked={appearance.dynamic} onChange={event=>change({...appearance,dynamic:event.target.checked})}/>Match my wallpaper on Android 12 and later</label>}
        <div className="widget-live-preview" aria-label="Widget preview">
          <div style={{background:tokens.surfaceAlt,color:tokens.onSurface}}><small style={{color:tokens.eyebrow}}>PREVIEW · GEOGRAPHY</small><strong>What is the capital of Mizoram?</strong><span style={{background:tokens.primary,color:tokens.onPrimary}}>Reveal</span></div>
          <div style={{background:tokens.hero,color:tokens.onHero}}><small style={{color:tokens.heroAccent}}>STUDY</small><b>12</b></div>
        </div>
      </section>
      <p className="dialog-muted">
        Android can queue reviews while the app is closed. Open RemoNook to
        process them and refresh due cards. Desktop study windows use the
        background app; they are app windows, not OS Widgets-board or macOS
        WidgetKit extensions.
      </p>
      {widget.error && <p role="alert">{widget.error}</p>}
    </section>
  );
}

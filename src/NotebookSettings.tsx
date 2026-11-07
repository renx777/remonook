import {NOTEBOOK_FONTS,NOTEBOOK_INKS,type Notebook,type NotebookFont,type NotebookInk,type NotebookPaper} from './notebook';

const PAPERS:[NotebookPaper,string][]=[['plain','Unruled'],['ruled','Ruled'],['dotted','Dotted']];

/** Settings → Appearance → Notebook. Per device; off restores the normal look. */
export function NotebookSettings({value,onChange,dark}:{value:Notebook;onChange:(patch:Partial<Notebook>)=>void;dark:boolean}){
  return <fieldset className="nb-settings">
    <legend>Notebook</legend>
    <label className="nb-switch-row"><span><strong>Notebook theme</strong><small>Your notes on paper, in handwriting. Only on this device; switch off for the normal look.</small></span><input type="checkbox" role="switch" checked={value.on} onChange={e=>onChange({on:e.target.checked})}/></label>
    {value.on&&<>
      <div className="nb-group" role="group" aria-label="Paper">
        <span className="nb-label">Paper</span>
        <div className="nb-papers">{PAPERS.map(([id,label])=><button key={id} type="button" aria-pressed={value.paper===id} className={`nb-paper nb-paper-${id}${value.paper===id?' is-on':''}`} onClick={()=>onChange({paper:id})}><span aria-hidden="true"/>{label}</button>)}</div>
      </div>
      <div className="nb-group" role="group" aria-label="Handwriting">
        <span className="nb-label">Handwriting</span>
        <div className="nb-fonts">{(Object.keys(NOTEBOOK_FONTS) as NotebookFont[]).map(id=>{const f=NOTEBOOK_FONTS[id];return <button key={id} type="button" aria-pressed={value.font===id} className={value.font===id?'is-on':''} style={f.family?{fontFamily:f.family,fontSize:`${f.scale}em`}:undefined} onClick={()=>onChange({font:id})}>{f.label}<small className="nb-font-sample">{f.sample}</small></button>;})}</div>
      </div>
      <div className="nb-group" role="group" aria-label="Ink">
        <span className="nb-label">Ink</span>
        <div className="nb-inks">{(Object.keys(NOTEBOOK_INKS) as NotebookInk[]).map(id=><button key={id} type="button" aria-label={`${NOTEBOOK_INKS[id].label} ink`} aria-pressed={value.ink===id} className={value.ink===id?'is-on':''} style={{background:dark?NOTEBOOK_INKS[id].dark:NOTEBOOK_INKS[id].light}} onClick={()=>onChange({ink:id})}/>)}</div>
      </div>
      {value.paper==='ruled'&&<label className="nb-switch-row"><span>Margin line</span><input type="checkbox" role="switch" checked={value.margin} onChange={e=>onChange({margin:e.target.checked})}/></label>}
    </>}
  </fieldset>;
}

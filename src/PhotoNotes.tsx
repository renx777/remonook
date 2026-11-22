// Photo to notes or flashcards: pick or take a photo, choose notes or flashcards, review and edit
// what was read, then add it under the bullet in one undoable step. The photo is shrunk on this
// device, read by Gemma 4 on Workers AI (/ai/photo) and not stored.
import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {CLOUD_API} from './cloud-config';
import {Icon} from './icons';
import './photo-notes.css';

export type PhotoResult={title:string;outline?:string;cards?:{question:string;answer:string}[]};
async function shrink(file:File):Promise<Blob>{
 const bitmap=await createImageBitmap(file).catch(()=>{throw Error('This image could not be opened.');});
 const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),c=document.createElement('canvas');
 c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext('2d')!.drawImage(bitmap,0,0,c.width,c.height);bitmap.close?.();
 const blob=await new Promise<Blob|null>(r=>c.toBlob(r,'image/jpeg',.85));c.width=c.height=0;if(!blob)throw Error('This image could not be prepared.');return blob;
}
export function PhotoNotes({user,targetTitle,disabled,onSave,onClose}:{user:Pick<User,'getIdToken'>;targetTitle:string;disabled:boolean;onSave:(r:PhotoResult)=>Promise<void>|void;onClose:()=>void}){
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[mode,setMode]=useState<'notes'|'cards'>('notes'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [result,setResult]=useState<PhotoResult|null>(null),[chosen,setChosen]=useState<boolean[]>([]),abort=useRef<AbortController|null>(null),root=useRef<HTMLElement>(null);
 useEffect(()=>{root.current?.focus();return()=>abort.current?.abort();},[]);
 useEffect(()=>{if(!file)return;const u=URL.createObjectURL(file);setPreview(u);return()=>URL.revokeObjectURL(u);},[file]);
 const read=async()=>{if(!file||busy)return;const c=new AbortController();abort.current=c;setBusy(true);setError('');setResult(null);
  try{const blob=await shrink(file);const r=await fetch(`${CLOUD_API}/ai/photo?id=${crypto.randomUUID()}&mode=${mode}`,{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'image/jpeg'},body:blob,signal:c.signal,cache:'no-store'});
   const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||'The photo could not be read.');setResult(v);setChosen((v.cards||[]).map(()=>true));}
  catch(e){if(!c.signal.aborted)setError((e as Error).message);}finally{setBusy(false);}};
 const save=async()=>{if(!result)return;setBusy(true);setError('');try{await onSave(result.cards?{...result,cards:result.cards.filter((_,i)=>chosen[i])}:result);onClose();}catch(e){setError((e as Error).message);setBusy(false);}};
 const card=(i:number,patch:Partial<{question:string;answer:string}>)=>setResult(r=>r&&r.cards?{...r,cards:r.cards.map((c,j)=>j===i?{...c,...patch}:c)}:r);
 const count=result?.cards?chosen.filter(Boolean).length:0;
 return <div className="photo-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <section ref={root} tabIndex={-1} className="photo-dialog" role="dialog" aria-label="Photo to notes" onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();onClose();}}}>
   <header><div><small>PHOTO TO NOTES</small><h2>Add under “{targetTitle.slice(0,60)||'this bullet'}”</h2></div><button className="icon-button" aria-label="Close photo to notes" onClick={onClose}><Icon name="close"/></button></header>
   <div className="photo-body">
    <div className="photo-pick">{preview?<img src={preview} alt="Chosen photo"/>:<Icon name="camera" size={34}/>}
     <label className="photo-file"><input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f){setFile(f);setResult(null);setError('');}}}/>{file?'Choose another photo':'Take or choose a photo'}</label>
     <small>A textbook page, slide, handwritten notes or a diagram.</small></div>
    <div className="photo-mode" role="radiogroup" aria-label="Make">{(['notes','cards'] as const).map(m=><button key={m} role="radio" aria-checked={mode===m} disabled={busy} onClick={()=>{setMode(m);setResult(null);}}>{m==='notes'?'Notes':'Flashcards'}</button>)}</div>
    <button className="study-primary" disabled={!file||busy||disabled} onClick={()=>void read()}>{busy&&!result?'Reading the photo…':result?'Read again':'Read photo'}</button>
    <p className="photo-note">The photo is read by Cloudflare AI and not stored. Check the result: AI can misread.</p>
    {error&&<p className="photo-error" role="alert">{error}</p>}
    {result&&<div className="photo-result">
     <label className="field-label">Title<input value={result.title} maxLength={100} onChange={e=>setResult({...result,title:e.target.value})}/></label>
     {result.outline!==undefined&&<label className="field-label">Notes · two spaces nest a line<textarea rows={12} value={result.outline} onChange={e=>setResult({...result,outline:e.target.value})}/></label>}
     {result.cards&&result.cards.map((c,i)=><article key={i} className="photo-card"><label className="photo-card-pick"><input type="checkbox" checked={!!chosen[i]} onChange={e=>setChosen(v=>v.map((x,j)=>j===i?e.target.checked:x))}/>Card {i+1}</label><input aria-label={`Question ${i+1}`} value={c.question} onChange={e=>card(i,{question:e.target.value})}/><textarea aria-label={`Answer ${i+1}`} rows={2} value={c.answer} onChange={e=>card(i,{answer:e.target.value})}/></article>)}
    </div>}
   </div>
   <footer><span>{result?.cards?`${count} flashcard${count===1?'':'s'} as a new deck · one undo step`:result?'Nested notes · one undo step':'Nothing is added until you review it'}</span><button className="study-primary" disabled={!result||busy||disabled||(!!result?.cards&&!count)} onClick={()=>void save()}>{result?.cards?'Add flashcards':'Add notes'}</button></footer>
  </section></div>;
}

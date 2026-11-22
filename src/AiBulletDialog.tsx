import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {aiRequest} from './ai-client';
import {useBackClose} from './back-stack';
import {ImageDialog} from './ImageTools';
import './ai-bullet.css';

export type AiQuestion = {id:string; question:string};
export type AiAnswer = AiQuestion & {answer:string; insertion:string};
type Entry = AiAnswer & {included:boolean; error:string};
type SharedProps = {user:User|null; disabled:boolean; onClose:()=>void};
type Props = SharedProps & (
  {mode:'image'; target:AiQuestion; onSave:(image:Blob,id:string)=>Promise<void>} |
  {mode:'answers'; targets:AiQuestion[]; isCurrent:(target:AiQuestion)=>boolean; onSave:(answers:AiAnswer[])=>Promise<void>}
);

export default function AiBulletDialog(props:Props){
  const [prompt,setPrompt]=useState(props.mode==='image'?props.target.question.slice(0,2048):'');
  const [image,setImage]=useState<{blob:Blob; id:string; prompt:string}|null>(null);
  const [previewUrl,setPreviewUrl]=useState('');
  const [entries,setEntries]=useState<Entry[]>(()=>props.mode==='answers'?props.targets.map(target=>({
    ...target,answer:'',insertion:crypto.randomUUID(),included:true,error:'',
  })):[]);
  const [progress,setProgress]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [busy,setBusy]=useState(false);
  const controller=useRef<AbortController|null>(null);
  const inserting=useRef(false);
  const title=props.mode==='image'?'Generate image':'Answer selected bullets';
  const close=()=>{if(!inserting.current)props.onClose();};
  useBackClose(true,close);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{
    if(!image)return;
    const url=URL.createObjectURL(image.blob);
    setPreviewUrl(url);
    return ()=>URL.revokeObjectURL(url);
  },[image]);

  const update=(id:string,patch:Partial<Entry>)=>
    setEntries(current=>current.map(entry=>entry.id===id?{...entry,...patch}:entry));

  const generate=async()=>{
    if(controller.current||inserting.current||!props.user)return;
    const run=new AbortController();
    controller.current=run;
    setBusy(true);
    setError('');
    try{
      if(props.mode==='image'){
        setProgress('Generating image…');
        const blob=await aiRequest(props.user,'image',{requestId:crypto.randomUUID(),prompt},run.signal);
        if(!run.signal.aborted)setImage({blob,id:crypto.randomUUID(),prompt});
      }else{
        const pending=entries.filter(entry=>entry.included&&!entry.answer.trim()&&props.isCurrent(entry));
        for(const [i,entry] of pending.entries()){
          if(run.signal.aborted)break;
          setProgress(`Answering ${i+1} of ${pending.length}…`);
          update(entry.id,{error:''});
          try{
            let answer='';
            await aiRequest(props.user,'generate',{
              requestId:crypto.randomUUID(),operation:'answer',mode:'general',question:entry.question,context:'',
            },run.signal,event=>{
              if(event.type==='done'&&typeof event.result?.text==='string')answer=event.result.text;
            });
            if(!run.signal.aborted)update(entry.id,{answer,error:answer?'':'No complete answer was returned.'});
          }catch(cause){
            if(run.signal.aborted)break;
            const failure=cause as {code?:string;status?:number};
            if(cause instanceof TypeError||failure.code==='shared_allowance'||[401,403,503].includes(failure.status||0))throw cause;
            update(entry.id,{error:(cause as Error).message});
          }
        }
      }
    }catch(cause){
      if(!run.signal.aborted)setError((cause as Error).message);
    }finally{
      controller.current=null;
      setProgress('');
      setBusy(false);
    }
  };

  const chosen=props.mode==='answers'?entries.filter(entry=>entry.included&&entry.answer.trim()&&props.isCurrent(entry)):[];
  const canGenerate=props.mode==='image'?!!prompt.trim():entries.some(entry=>entry.included&&!entry.answer.trim()&&props.isCurrent(entry));
  const save=async()=>{
    if(inserting.current||controller.current||props.disabled)return;
    inserting.current=true;
    setSaving(true);
    setError('');
    try{
      if(props.mode==='image'&&image)await props.onSave(image.blob,image.id);
      if(props.mode==='answers'&&chosen.length)await props.onSave(chosen);
    }catch(cause){
      setError((cause as Error).message);
    }finally{
      inserting.current=false;
      setSaving(false);
    }
  };
  return <ImageDialog title={title} onClose={close} className="ai-bullet-dialog">
    <div className="ai-bullet-body">
      {props.mode==='image'?<>
        <p className="research-hint">Attach to “{props.target.question || 'Untitled bullet'}”</p>
        <label className="field-label">Image prompt<textarea rows={3} maxLength={2048} value={prompt} disabled={busy||saving} onChange={event=>setPrompt(event.target.value)}/></label>
        {image&&previewUrl&&<figure><img src={previewUrl} alt={image.prompt}/><figcaption>AI-generated preview</figcaption></figure>}
      </>:<>
        <p className="research-hint">Review and edit each answer before adding it under its question.</p>
        {entries.map((entry,i)=>{
          const current=props.isCurrent(entry);
          return <article key={entry.id} className="ai-bullet-entry">
            <label><input type="checkbox" checked={entry.included&&current} disabled={busy||saving||!current} onChange={event=>update(entry.id,{included:event.target.checked})}/><span>{entry.question}</span></label>
            {!current&&<small>Question changed or was removed.</small>}
            {entry.error&&<small role="alert">{entry.error}</small>}
            {(entry.answer||entry.error)&&<textarea aria-label={`Answer ${i+1}`} rows={3} maxLength={16000} value={entry.answer} readOnly={busy||saving||!current} onChange={event=>update(entry.id,{answer:event.target.value,error:''})}/>}
          </article>;
        })}
      </>}
      {!!progress&&<p role="status">{progress}</p>}
      {!!error&&<p role="alert" className="research-error">{error}</p>}
      {!props.user&&<p className="research-hint">Sign in to generate.</p>}
      <div className="ai-bullet-generate">
        <button type="button" disabled={props.disabled||!canGenerate||!props.user||busy||saving} onClick={()=>void generate()}>{props.mode==='image'?(image?'Generate again':'Generate image'):(chosen.length?'Generate remaining':'Generate answers')}</button>
        {busy&&<button type="button" onClick={()=>controller.current?.abort()}>Stop</button>}
      </div>
    </div>
    <footer>
      {props.mode==='image'&&image&&previewUrl&&<a href={previewUrl} download="remonook-generated-image.jpg">Download image</a>}
      <button type="button" className="primary" disabled={props.disabled||busy||saving||(props.mode==='image'?!image:!chosen.length)} onClick={()=>void save()}>{saving?'Saving…':props.mode==='image'?'Attach image':`Add ${chosen.length||''} ${chosen.length===1?'answer':'answers'}`.replace('  ',' ')}</button>
    </footer>
  </ImageDialog>;
}

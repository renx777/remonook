// Voice review: answer a flashcard aloud. Records until you stop or pause for a moment, transcribes
// with /ai/transcribe, then checks the answer: "I don't know" and exact matches are handled here
// for free, anything else is checked by /ai/grade. The app suggests a grade; you confirm it.
import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {CLOUD_API} from './cloud-config';
import {Icon} from './icons';
import {gaveUp,quickMatch,suggestedGrade,verdict} from './voice-review.mjs';
import './voice-review.css';

export type VoiceResult={transcript:string;covered:number[];verdict:'correct'|'partial'|'incorrect';feedback:string;suggested:string;checkedBy:'app'|'ai'};
type Phase='starting'|'listening'|'checking'|'done'|'error';
const MAX_MS=60_000,SILENCE_MS=1800,TYPES=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4','audio/webm'];
async function call(user:Pick<User,'getIdToken'>,path:string,init:RequestInit){
 const r=await fetch(CLOUD_API+path,{...init,headers:{Authorization:'Bearer '+await user.getIdToken(),...(init.headers||{})},cache:'no-store'});
 const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||'Voice review is unavailable.');return v;
}
const label={correct:'Correct',partial:'Partly right',incorrect:'Not quite'};

export function VoiceReview({user,question,points,onResult,onClose}:{user:Pick<User,'getIdToken'>;question:string;points:string[];onResult:(r:VoiceResult)=>void;onClose:()=>void}){
 const [phase,setPhase]=useState<Phase>('starting'),[seconds,setSeconds]=useState(0),[error,setError]=useState(''),[result,setResult]=useState<VoiceResult|null>(null),[level,setLevel]=useState(0);
 const st=useRef({stream:null as MediaStream|null,rec:null as MediaRecorder|null,ctx:null as AudioContext|null,timer:0,abort:new AbortController()});
 const stop=()=>{const s=st.current;clearInterval(s.timer);if(s.rec?.state==='recording')s.rec.stop();s.stream?.getTracks().forEach(t=>t.stop());s.stream=null;void s.ctx?.close().catch(()=>{});s.ctx=null;};
 const check=async(blob:Blob)=>{
  setPhase('checking');
  try{
   if(blob.size<256)throw Error('Nothing was recorded. Try again, a little closer to the microphone.');
   const t=await call(user,'/ai/transcribe?id='+crypto.randomUUID(),{method:'POST',headers:{'Content-Type':blob.type||'audio/webm'},body:blob,signal:st.current.abort.signal});
   const transcript=String(t.text||'').trim();
   let covered:number[]=[],feedback='',wrong=false,checkedBy:VoiceResult['checkedBy']='app';
   if(gaveUp(transcript))feedback=transcript?'No problem. Read the answer and try it again later.':'Nothing was heard.';
   else{covered=quickMatch(points,transcript);if(covered.length<points.length){const g=await call(user,'/ai/grade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),question,points,transcript}),signal:st.current.abort.signal});covered=[...new Set([...covered,...g.covered])].sort((a,b)=>a-b);wrong=!!g.wrong;feedback=g.feedback||'';checkedBy='ai';}}
   const v=verdict(covered,points.length,wrong) as VoiceResult['verdict'],r={transcript,covered,verdict:v,feedback,suggested:suggestedGrade(v),checkedBy};
   setResult(r);setPhase('done');onResult(r);
  }catch(e){if(!st.current.abort.signal.aborted){setError((e as Error).message);setPhase('error');}}
 };
 useEffect(()=>{let live=true;(async()=>{
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('This browser cannot record audio.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}).catch(()=>{throw Error('Allow microphone access to answer aloud.');});
   if(!live){stream.getTracks().forEach(t=>t.stop());return;}
   const s=st.current;s.stream=stream;const type=TYPES.find(t=>MediaRecorder.isTypeSupported(t));
   const rec=new MediaRecorder(stream,{...(type?{mimeType:type}:{}),audioBitsPerSecond:32000}),parts:Blob[]=[];s.rec=rec;
   rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};rec.onstop=()=>{if(live)void check(new Blob(parts,{type:rec.mimeType||type||'audio/webm'}));};
   // Stop by itself after a pause once you have started speaking.
   const ctx=new AudioContext();s.ctx=ctx;const an=ctx.createAnalyser();an.fftSize=1024;ctx.createMediaStreamSource(stream).connect(an);const buf=new Float32Array(an.fftSize);
   let spoke=false,quietSince=0;const began=Date.now();rec.start();setPhase('listening');
   s.timer=window.setInterval(()=>{an.getFloatTimeDomainData(buf);let sum=0;for(const x of buf)sum+=x*x;const rms=Math.sqrt(sum/buf.length);setLevel(Math.min(1,rms*12));
    const now=Date.now();setSeconds((now-began)/1000);
    if(rms>0.02){spoke=true;quietSince=0;}else if(spoke){quietSince=quietSince||now;if(now-quietSince>SILENCE_MS)stop();}
    if(now-began>MAX_MS)stop();},100);
  }catch(e){if(live){setError((e as Error).message);setPhase('error');}}
 })();return()=>{live=false;st.current.abort.abort();stop();};},[]);

 return <section className={'voice-review is-'+phase} aria-label="Voice review" aria-live="polite">
  {phase==='starting'&&<p>Starting the microphone…</p>}
  {phase==='listening'&&<><span className="voice-level" style={{'--level':level} as React.CSSProperties} aria-hidden="true"/><p><strong>Say your answer</strong> · {Math.floor(seconds)}s · stops when you pause</p><button type="button" className="voice-done" onClick={stop}>Done</button><button type="button" aria-label="Cancel voice answer" onClick={onClose}><Icon name="close" size={14}/></button></>}
  {phase==='checking'&&<p>Checking your answer…</p>}
  {phase==='error'&&<><p>{error}</p><button type="button" onClick={onClose}>Close</button></>}
  {phase==='done'&&result&&<div className="voice-result">
   <div className="voice-result-head"><span className={'voice-verdict is-'+result.verdict}>{label[result.verdict]}</span><small>{result.covered.length} of {points.length} point{points.length===1?'':'s'}{result.checkedBy==='ai'?' · checked by AI, may be wrong':''}</small><button type="button" aria-label="Close voice review" onClick={onClose}><Icon name="close" size={14}/></button></div>
   <p className="voice-transcript">You said: “{result.transcript||'…'}”</p>
   <ul className="voice-points">{points.map((p,i)=><li key={i} className={result.covered.includes(i+1)?'is-covered':''}><span aria-hidden="true">{result.covered.includes(i+1)?'✓':'✗'}</span>{p}<span className="sr-only">{result.covered.includes(i+1)?' (covered)':' (missed)'}</span></li>)}</ul>
   {result.feedback&&<p className="voice-feedback">{result.feedback}</p>}
   <p className="voice-hint">Suggested: <strong>{result.suggested[0]+result.suggested.slice(1).toLowerCase()}</strong>. Press Enter to accept, or choose another grade.</p>
  </div>}
 </section>;
}
